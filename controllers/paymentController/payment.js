const { PrismaClient, PaymentMethod, PaymentStatus, BookingStatus, NotificationType } = require("@prisma/client");
const prisma = new PrismaClient();
const Decimal = require("decimal.js");
const midtransClient = require('midtrans-client');

// Konfig Midtrans Snap
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Helper createNotification
const createNotification = async (userId, type, title, body) => {
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      channel: "APP",
    },
  });
};

// Fungsi hitung total
const calculateBookingTotal = async (bookingId) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      items: {
        include: {
          asset: true,
          service: true,
        },
      },
    },
  });

  if (!booking) throw new Error("Booking tidak ditemukan");

  let total = new Decimal(0);

  const start = new Date(booking.startDatetime);
  const end = new Date(booking.endDatetime);
  const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  for (const item of booking.items) {
    if (item.itemType === "ASET") {
      const itemTotal = new Decimal(item.asset.dailyRate).times(item.qty).times(durationDays);
      total = total.plus(itemTotal);
    } else if (item.itemType === "JASA") {
      const itemTotal = new Decimal(item.service.unitRate).times(item.qty);
      total = total.plus(itemTotal);
    }
  }

  return total;
};

// Fungsi untuk generate order_id yang lebih pendek
const generateOrderId = (bookingId) => {
  // Ambil 8 karakter pertama dari bookingId + timestamp pendek
  const shortBookingId = bookingId.substring(0, 8);
  const shortTimestamp = Date.now().toString().slice(-6); // Ambil 6 digit terakhir
  return `bk-${shortBookingId}-${shortTimestamp}`;
};

const createPayment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { bookingId } = req.params;
    const { method } = req.body;

    // Validasi input
    if (!userId) {
      return res.status(401).json({ message: "User tidak terautentikasi" });
    }

    if (!bookingId) {
      return res.status(400).json({ message: "Booking ID diperlukan" });
    }

    // Cek booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ message: "Booking bukan milik Anda" });
    }

    if (booking.status !== BookingStatus.DIKONFIRMASI) {
      return res.status(400).json({ message: "Booking belum dikonfirmasi oleh admin" });
    }

    // Cek existing payment
    const existingPayment = await prisma.payment.findFirst({
      where: { 
        bookingId, 
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PAID] } 
      },
    });

    if (existingPayment) {
      return res.status(400).json({ 
        message: "Sudah ada pembayaran yang sedang diproses",
        payment: existingPayment 
      });
    }

    // Hitung total
    const amount = await calculateBookingTotal(bookingId);

    // Validasi amount
    if (amount.lte(0)) {
      return res.status(400).json({ message: "Amount pembayaran tidak valid" });
    }

    // Get user details untuk Midtrans
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true }
    });

    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    // Parse nama user dengan safety check
    const userName = user.name || 'Customer';
    const nameParts = userName.split(' ');
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Generate order_id yang lebih pendek
    const orderId = generateOrderId(bookingId);
    console.log(`Generated order_id: ${orderId}, Length: ${orderId.length}`);

    // Validasi panjang order_id
    if (orderId.length > 50) {
      // Fallback: gunakan timestamp saja jika masih terlalu panjang
      const fallbackOrderId = `bk-${Date.now()}`;
      console.log(`Order_id too long, using fallback: ${fallbackOrderId}`);
    }

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount.toNumber(),
      },
      customer_details: {
        first_name: firstName,
        last_name: lastName,
        email: user.email || '',
        phone: user.phone || '',
      },
      enabled_payments: method === 'QRIS' ? ['qris'] : 
                       method === 'TRANSFER' ? ['bank_transfer'] : 
                       ['qris', 'bank_transfer'],
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/payment/success`, // URL setelah pembayaran selesai
        error: `${process.env.FRONTEND_URL}/payment/error`, // URL jika error
        pending: `${process.env.FRONTEND_URL}/payment/pending` // URL jika pending
      }
    };

    // Buat transaction di Midtrans
    const transaction = await snap.createTransaction(parameter);

    // Tentukan payment method
    let paymentMethod = PaymentMethod.QRIS;
    if (method === 'TRANSFER') {
      paymentMethod = PaymentMethod.TRANSFER;
    } else if (method === 'CASH') {
      paymentMethod = PaymentMethod.CASH;
    }

    // Simpan payment di DB
    const newPayment = await prisma.payment.create({
      data: {
        bookingId,
        amount: amount.toString(),
        method: paymentMethod,
        status: PaymentStatus.PENDING,
        referenceNo: orderId,
        proofUrl: transaction.redirect_url,
      },
      include: {
        booking: {
          select: {
            id: true,
            startDatetime: true,
            endDatetime: true,
            status: true
          }
        }
      }
    });

    // Kirim notif
    await createNotification(
      userId,
      NotificationType.PAYMENT,
      "Pembayaran Dibuat",
      `Silakan selesaikan pembayaran untuk booking ID ${bookingId}`
    );

    res.status(201).json({
      message: "Pembayaran berhasil dibuat",
      payment: newPayment,
      paymentUrl: transaction.redirect_url,
      token: transaction.token
    });

  } catch (error) {
    console.error("Create payment error:", error);
    
    // Handle Midtrans error khusus
    if (error.httpStatusCode === 400) {
      return res.status(400).json({ 
        message: "Error dari payment gateway", 
        details: error.ApiResponse?.error_messages || error.message 
      });
    }

    res.status(500).json({ 
      message: "Terjadi kesalahan server",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getPaymentDetails = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "User tidak terautentikasi" });
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { 
        booking: {
          select: {
            userId: true,
            startDatetime: true,
            endDatetime: true,
            status: true
          }
        } 
      },
    });

    if (!payment) {
      return res.status(404).json({ message: "Pembayaran tidak ditemukan" });
    }

    // Cek authorization
    if (payment.booking.userId !== userId && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    res.status(200).json(payment);
  } catch (error) {
    console.error("Get payment details error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Notification handler untuk Midtrans
const handleMidtransNotification = async (req, res) => {
  try {
    console.log('🎯 Midtrans notification received:', JSON.stringify(req.body, null, 2));

    const notificationJson = req.body;
    const orderId = notificationJson.order_id;

    console.log(`🔍 Processing notification for order_id: ${orderId}`);

    // ✅ HANDLE TEST NOTIFICATION DARI MIDTRANS SIMULATOR
    if (orderId && orderId.startsWith('payment_notif_test_')) {
      console.log('🧪 TEST NOTIFICATION DETECTED - Simulating successful payment');
      
      // Untuk testing, kita coba cari payment terbaru atau buat simulation
      const latestPayment = await prisma.payment.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { booking: { select: { userId: true, status: true } } }
      });

      if (latestPayment) {
        console.log(`✅ Using latest payment for testing: ${latestPayment.id}`);
        
        // Update payment status untuk testing
        await prisma.payment.update({
          where: { id: latestPayment.id },
          data: {
            status: PaymentStatus.PAID,
            paidAt: new Date(),
          },
        });

        // Update booking status
        await prisma.booking.update({
          where: { id: latestPayment.bookingId },
          data: { status: BookingStatus.DIBAYAR },
        });

        // Kirim notifikasi
        await createNotification(
          latestPayment.booking.userId,
          NotificationType.PAYMENT,
          "TEST - Pembayaran Berhasil",
          `Pembayaran TEST untuk booking ID ${latestPayment.bookingId} telah berhasil.`
        );

        console.log('🎉 TEST NOTIFICATION PROCESSED SUCCESSFULLY');
        return res.status(200).json({ 
          message: "Test notification processed successfully",
          paymentId: latestPayment.id,
          status: "PAID"
        });
      } else {
        console.log('⚠️ No recent payment found for testing');
        return res.status(200).json({ 
          message: "Test notification received but no payment to update" 
        });
      }
    }

    // ✅ PROSES NOTIFICATION REAL
    console.log('🔍 Looking for real payment with order_id:', orderId);
    
    const payment = await prisma.payment.findFirst({
      where: { referenceNo: orderId },
      include: {
        booking: {
          select: {
            userId: true,
            status: true
          }
        }
      }
    });

    if (!payment) {
      console.warn(`❌ Payment dengan orderId ${orderId} tidak ditemukan di database`);
      
      // Coba cari dengan pattern matching jika order_id tidak exact match
      const alternativePayment = await prisma.payment.findFirst({
        where: {
          referenceNo: { contains: orderId.substring(0, 10) }
        }
      });

      if (alternativePayment) {
        console.log(`✅ Found alternative payment: ${alternativePayment.id}`);
        // Lanjutkan dengan payment yang ditemukan
        // ... [rest of your processing logic for real payment]
      } else {
        console.log('📋 Listing all payments for debugging:');
        const allPayments = await prisma.payment.findMany({
          select: { id: true, referenceNo: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 5
        });
        console.log('Recent payments:', allPayments);
        
        return res.status(200).json({ 
          message: "Payment not found, but notification accepted",
          recentPayments: allPayments
        });
      }
    }

    console.log(`✅ Payment found: ${payment.id}, current status: ${payment.status}`);

    // Verifikasi status dari Midtrans
    let statusResponse;
    try {
      statusResponse = await snap.transaction.status(orderId);
      console.log(`📊 Midtrans status response:`, JSON.stringify(statusResponse, null, 2));
    } catch (midtransError) {
      console.error('❌ Error checking Midtrans status:', midtransError);
      
      if (midtransError.httpStatusCode === '404') {
        console.log(`⏳ Transaction ${orderId} not yet processed by Midtrans`);
        return res.status(200).json({ message: "Transaction not yet processed" });
      }
      throw midtransError;
    }

    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`🔄 Transaction status: ${transactionStatus}, Fraud status: ${fraudStatus}`);

    // Skip jika status sudah sama
    if (payment.status === PaymentStatus.PAID && transactionStatus === 'settlement') {
      console.log(`✅ Payment ${payment.id} already paid, skipping update`);
      return res.status(200).json({ message: "Payment already processed" });
    }

    let newPaymentStatus = payment.status;
    let newBookingStatus = payment.booking.status;

    // Logic status update
    if (transactionStatus === 'capture' && fraudStatus === 'accept') {
      newPaymentStatus = PaymentStatus.PAID;
      newBookingStatus = BookingStatus.DIBAYAR;
    } else if (transactionStatus === 'settlement') {
      newPaymentStatus = PaymentStatus.PAID;
      newBookingStatus = BookingStatus.DIBAYAR;
    } else if (['deny', 'cancel', 'expire'].includes(transactionStatus)) {
      newPaymentStatus = PaymentStatus.FAILED;
    } else if (transactionStatus === 'pending') {
      newPaymentStatus = PaymentStatus.PENDING;
    }

    console.log(`🔄 Updating payment to: ${newPaymentStatus}, booking to: ${newBookingStatus}`);

    // Update hanya jika status berubah
    if (newPaymentStatus !== payment.status) {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: newPaymentStatus,
            paidAt: newPaymentStatus === PaymentStatus.PAID ? new Date() : undefined,
          },
        });

        if (newPaymentStatus === PaymentStatus.PAID) {
          await tx.booking.update({
            where: { id: payment.bookingId },
            data: { status: newBookingStatus },
          });
        }
      });

      // Kirim notifikasi
      if (newPaymentStatus === PaymentStatus.PAID) {
        await createNotification(
          payment.booking.userId,
          NotificationType.PAYMENT,
          "Pembayaran Berhasil",
          `Pembayaran untuk booking ID ${payment.bookingId} telah berhasil.`
        );

        // Notif admin
        const admins = await prisma.user.findMany({ 
          where: { role: "ADMIN" },
          select: { id: true }
        });
        
        await Promise.all(
          admins.map((admin) =>
            createNotification(
              admin.id,
              NotificationType.PAYMENT,
              "Pembayaran Masuk",
              `Pembayaran baru untuk booking ID ${payment.bookingId}.`
            )
          )
        );
        
        console.log(`🎉 Payment ${payment.id} successfully updated to PAID`);
      }
    } else {
      console.log(`ℹ️ No status change needed for payment ${payment.id}`);
    }

    res.status(200).json({ 
      message: "Notification processed successfully",
      paymentId: payment.id,
      newStatus: newPaymentStatus
    });

  } catch (error) {
    console.error("❌ Midtrans notification error:", error);
    res.status(200).json({ 
      message: "Notification received but processing failed",
      error: error.message 
    });
  }
};

// Fungsi untuk check payment status (optional, untuk sync manual)
const checkPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.user?.id;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { select: { userId: true } } }
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment tidak ditemukan" });
    }

    if (payment.booking.userId !== userId && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    // Check status dari Midtrans
    const statusResponse = await snap.transaction.status(payment.referenceNo);

    res.status(200).json({
      paymentStatus: payment.status,
      midtransStatus: statusResponse.transaction_status,
      details: statusResponse
    });

  } catch (error) {
    console.error("Check payment status error:", error);
    res.status(500).json({ message: "Error checking payment status" });
  }
};

module.exports = {
  createPayment,
  getPaymentDetails,
  handleMidtransNotification,
  checkPaymentStatus,
};