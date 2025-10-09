const { PrismaClient, NotificationType } = require("@prisma/client");
const prisma = new PrismaClient();

// Helper untuk membuat notifikasi
const createNotification = async (userId, type, title, body) => {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        channel: "APP",
      },
    });
  } catch (e) {
    console.error("Create notification error:", e.message);
  }
};

// Get bookings by user
const getBookingsByUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const bookings = await prisma.booking.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            service: {
              include: {
                category: { select: { id: true, name: true } },
                Package: true
              }
            },
            package: true
          }
        },
        payments: true,
        user: { select: { id: true, name: true, email: true } },
        approval: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Get bookings error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Create booking from cart
const createBookingFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, notes } = req.body; // Notes opsional untuk booking keseluruhan

    // Validasi tanggal
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Tanggal mulai dan akhir diperlukan" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({ message: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir" });
    }

    // Ambil semua item cart milik user
    const cartItems = await prisma.cart.findMany({
      where: { userId },
      include: {
        service: { select: { id: true, isActive: true, name: true, unitRate: true } },
        package: { select: { id: true, unitRate: true } }
      }
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ message: "Keranjang kosong, tambahkan item terlebih dahulu" });
    }

    // Hitung durasi hari (inclusive, start==end = 1 hari)
    const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    let totalAmount = 0;
    const bookingItemsData = [];

    for (const cartItem of cartItems) {
      // Cek service aktif
      if (!cartItem.service.isActive) {
        return res.status(400).json({ message: `Service ${cartItem.service.name} tidak aktif` });
      }

      let rate = cartItem.service.unitRate.toNumber();

      if (cartItem.packageId) {
        rate = cartItem.package.unitRate.toNumber();
      }

      const itemSubtotal = rate * durationDays * cartItem.quantity;
      totalAmount += itemSubtotal;

      bookingItemsData.push({
        type: 'JASA',
        serviceId: cartItem.serviceId,
        packageId: cartItem.packageId || null,
        quantity: cartItem.quantity,
        unitPrice: rate,
        subtotal: itemSubtotal,
        notes: cartItem.notes || null  // Transfer notes dari cart ke booking item
      });
    }

    // Buat booking
    const booking = await prisma.booking.create({
      data: {
        userId,
        startDate: start,
        endDate: end,
        totalAmount,
        type: 'JASA',
        status: 'MENUNGGU',
        notes: notes || null,  // Notes keseluruhan jika diberikan
        items: {
          create: bookingItemsData
        }
      },
      include: {
        items: {
          include: {
            service: true,
            package: true
          }
        }
      }
    });

    // Clear cart setelah sukses
    await prisma.cart.deleteMany({ where: { userId } });

    // Kirim notifikasi ke semua admin
    try {
      const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
      await Promise.all(
        admins.map((admin) =>
          createNotification(
            admin.id,
            NotificationType.BOOKING,
            "Booking Baru",
            `Booking ${booking.id} menunggu konfirmasi.`
          )
        )
      );
    } catch (e) {
      console.error("Send admin booking notification error:", e.message);
    }

    res.status(201).json({
      message: "Booking berhasil dibuat dari keranjang",
      booking
    });
  } catch (error) {
    console.error("Create booking from cart error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Create booking manual (tanpa cart, langsung input items)
const createBooking = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, notes, items } = req.body; // items: [{serviceId, packageId, quantity, notes}]

    // Validasi input dasar
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Tanggal mulai dan akhir diperlukan" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({ message: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Minimal satu item jasa diperlukan" });
    }

    // Hitung durasi (start==end = 1 hari)
    const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    let totalAmount = 0;
    const bookingItemsData = [];

    for (const item of items) {
      const { serviceId, packageId, quantity = 1, notes: itemNotes } = item;

      if (!serviceId) {
        return res.status(400).json({ message: "Service ID diperlukan untuk setiap item" });
      }

      const service = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { id: true, isActive: true, name: true, unitRate: true }
      });

      if (!service) {
        return res.status(404).json({ message: `Service ${serviceId} tidak ditemukan` });
      }

      if (!service.isActive) {
        return res.status(400).json({ message: `Service ${service.name} tidak aktif` });
      }

      let rate = service.unitRate.toNumber();

      if (packageId) {
        const pkg = await prisma.package.findUnique({
          where: { id: packageId },
          select: { id: true, serviceId: true, unitRate: true }
        });

        if (!pkg) {
          return res.status(404).json({ message: `Paket ${packageId} tidak ditemukan` });
        }

        if (pkg.serviceId !== serviceId) {
          return res.status(400).json({ message: "Paket tidak sesuai dengan service" });
        }

        rate = pkg.unitRate.toNumber();
      }

      const itemSubtotal = rate * durationDays * quantity;
      totalAmount += itemSubtotal;

      bookingItemsData.push({
        type: 'JASA',
        serviceId,
        packageId: packageId || null,
        quantity,
        unitPrice: rate,
        subtotal: itemSubtotal,
        notes: itemNotes || null  // Notes per item jika diberikan
      });
    }

    const booking = await prisma.booking.create({
      data: {
        userId,
        startDate: start,
        endDate: end,
        totalAmount,
        type: 'JASA',
        status: 'MENUNGGU',
        notes: notes || null,
        items: {
          create: bookingItemsData
        }
      },
      include: {
        items: {
          include: {
            service: true,
            package: true
          }
        }
      }
    });

    // Kirim notifikasi ke semua admin
    try {
      const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
      await Promise.all(
        admins.map((admin) =>
          createNotification(
            admin.id,
            NotificationType.BOOKING,
            "Booking Baru",
            `Booking ${booking.id} menunggu konfirmasi.`
          )
        )
      );
    } catch (e) {
      console.error("Send admin booking notification error:", e.message);
    }

    res.status(201).json({
      message: "Booking berhasil dibuat",
      booking
    });
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Update booking
const updateBooking = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { startDate, endDate, notes } = req.body;

    const existingBooking = await prisma.booking.findFirst({
      where: { id, userId },
      include: { items: true }
    });

    if (!existingBooking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    if (existingBooking.status !== 'MENUNGGU') {
      return res.status(400).json({ message: "Hanya booking menunggu yang bisa diupdate" });
    }

    let data = {};
    let recalculate = false;

    if (startDate || endDate) {
      const newStart = startDate ? new Date(startDate) : existingBooking.startDate;
      const newEnd = endDate ? new Date(endDate) : existingBooking.endDate;

      if (newStart > newEnd) {
        return res.status(400).json({ message: "Tanggal mulai harus sebelum atau sama dengan tanggal akhir" });
      }

      data.startDate = newStart;
      data.endDate = newEnd;
      recalculate = true;
    }

    if (notes !== undefined) {
      data.notes = notes;
    }

    if (recalculate) {
      const durationDays = Math.ceil((data.endDate - data.startDate) / (1000 * 60 * 60 * 24)) + 1;
      let newTotal = 0;

      for (const item of existingBooking.items) {
        const itemSubtotal = item.unitPrice.toNumber() * durationDays * item.quantity;
        newTotal += itemSubtotal;

        await prisma.bookingItem.update({
          where: { id: item.id },
          data: { subtotal: itemSubtotal }
        });
      }

      data.totalAmount = newTotal;
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      },
      include: {
        items: {
          include: {
            service: true,
            package: true
          }
        }
      }
    });

    res.status(200).json({
      message: "Booking berhasil diupdate",
      booking: updatedBooking
    });
  } catch (error) {
    console.error("Update booking error:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Cancel booking
const cancelBooking = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existingBooking = await prisma.booking.findFirst({
      where: { id, userId }
    });

    if (!existingBooking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    if (existingBooking.status !== 'MENUNGGU' && existingBooking.status !== 'DIKONFIRMASI') {
      return res.status(400).json({ message: "Hanya booking menunggu atau dikonfirmasi yang bisa dibatalkan" });
    }

    await prisma.booking.update({
      where: { id },
      data: {
        status: 'DIBATALKAN',
        updatedAt: new Date()
      }
    });

    res.status(200).json({
      message: "Booking berhasil dibatalkan"
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Get all bookings (untuk admin)
const getAllBookings = async (req, res) => {
  try {
    // Cek role admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Akses ditolak, hanya admin" });
    }

    const bookings = await prisma.booking.findMany({
      include: {
        items: {
          include: {
            service: {
              include: {
                category: { select: { id: true, name: true } },
                Package: true
              }
            },
            package: true
          }
        },
        payments: true,
        user: { select: { id: true, name: true, email: true } },
        approval: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Get all bookings error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Get booking by ID (untuk admin)
const getBookingById = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Akses ditolak, hanya admin" });
    }

    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            service: {
              include: {
                category: { select: { id: true, name: true } },
                Package: true
              }
            },
            package: true
          }
        },
        payments: true,
        user: { select: { id: true, name: true, email: true } },
        approval: { select: { id: true, name: true } }
      }
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    res.status(200).json(booking);
  } catch (error) {
    console.error("Get booking by ID error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Confirm booking (approve oleh admin)
const confirmBooking = async (req, res) => {
  try {
    const adminId = req.user.id;
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Akses ditolak, hanya admin" });
    }

    const { id } = req.params;
    const { notes } = req.body; // Opsional: notes dari admin

    const existingBooking = await prisma.booking.findUnique({
      where: { id }
    });

    if (!existingBooking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    if (existingBooking.status !== 'MENUNGGU') {
      return res.status(400).json({ message: "Hanya booking menunggu yang bisa dikonfirmasi" });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: 'DIKONFIRMASI',
        approvalId: adminId,
        notes: notes ? `${existingBooking.notes ? existingBooking.notes + '\n' : ''}Admin notes: ${notes}` : existingBooking.notes,
        updatedAt: new Date()
      },
      include: {
        items: {
          include: {
            service: true,
            package: true
          }
        }
      }
    });

    // Kirim notifikasi ke user
    try {
      await createNotification(
        existingBooking.userId,
        NotificationType.BOOKING,
        "Booking Dikonfirmasi",
        `Booking ${updatedBooking.id} telah dikonfirmasi admin. Silakan lanjutkan proses pembayaran jika diperlukan.`
      );
    } catch (e) {
      console.error("Send user confirm notification error:", e.message);
    }

    res.status(200).json({
      message: "Booking berhasil dikonfirmasi",
      booking: updatedBooking
    });
  } catch (error) {
    console.error("Confirm booking error:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Reject booking (tolak oleh admin)
const rejectBooking = async (req, res) => {
  try {
    const adminId = req.user.id;
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Akses ditolak, hanya admin" });
    }

    const { id } = req.params;
    const { reason } = req.body; // Alasan penolakan (opsional)

    const existingBooking = await prisma.booking.findUnique({
      where: { id }
    });

    if (!existingBooking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    if (existingBooking.status !== 'MENUNGGU') {
      return res.status(400).json({ message: "Hanya booking menunggu yang bisa ditolak" });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: 'DITOLAK',
        approvalId: adminId,
        notes: reason ? `${existingBooking.notes ? existingBooking.notes + '\n' : ''}Alasan ditolak: ${reason}` : existingBooking.notes,
        updatedAt: new Date()
      },
      include: {
        items: {
          include: {
            service: true,
            package: true
          }
        }
      }
    });

    // Kirim notifikasi ke user
    try {
      await createNotification(
        existingBooking.userId,
        NotificationType.BOOKING,
        "Booking Ditolak",
        `Booking ${updatedBooking.id} ditolak.${reason ? ' Alasan: ' + reason : ''}`
      );
    } catch (e) {
      console.error("Send user reject notification error:", e.message);
    }

    res.status(200).json({
      message: "Booking berhasil ditolak",
      booking: updatedBooking
    });
  } catch (error) {
    console.error("Reject booking error:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Complete booking (ubah ke SELESAI, mungkin setelah payment atau return)
const completeBooking = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Akses ditolak, hanya admin" });
    }

    const { id } = req.params;

    const existingBooking = await prisma.booking.findUnique({
      where: { id }
    });

    if (!existingBooking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    if (existingBooking.status !== 'DIKONFIRMASI') {
      return res.status(400).json({ message: "Hanya booking dikonfirmasi yang bisa diselesaikan" });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: 'SELESAI',
        updatedAt: new Date()
      },
      include: {
        items: {
          include: {
            service: true,
            package: true
          }
        }
      }
    });

    // Kirim notifikasi ke user
    try {
      await createNotification(
        existingBooking.userId,
        NotificationType.BOOKING,
        "Booking Selesai",
        `Terima kasih, booking ${updatedBooking.id} telah selesai.`
      );
    } catch (e) {
      console.error("Send user complete notification error:", e.message);
    }
    res.status(200).json({
      message: "Booking berhasil diselesaikan",
      booking: updatedBooking
    });
  } catch (error) {
    console.error("Complete booking error:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};
  
module.exports = {
  getBookingsByUser,
  createBookingFromCart,
  createBooking,
  updateBooking,
  cancelBooking,
  getAllBookings,
  getBookingById,
  confirmBooking,
  rejectBooking,
  completeBooking
};
