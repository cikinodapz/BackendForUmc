const {
  PrismaClient,
  BookingType,
  BookingStatus,
  NotificationType,
} = require("@prisma/client");
const prisma = new PrismaClient();
const Decimal = require("decimal.js"); // Asumsi sudah install decimal.js untuk handle Decimal akurat

// Helper function untuk create notification
const createNotification = async (userId, type, title, body) => {
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      channel: "APP", // Default ke APP, bisa diubah jika perlu
    },
  });
};

const createBookingFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDatetime, endDatetime, notes } = req.body;

    if (!startDatetime || !endDatetime) {
      return res
        .status(400)
        .json({ message: "Tanggal mulai dan akhir diperlukan" });
    }

    const start = new Date(startDatetime);
    const end = new Date(endDatetime);

    if (start >= end) {
      return res
        .status(400)
        .json({ message: "Tanggal mulai harus sebelum tanggal akhir" });
    }

    // Ambil semua item cart user
    const cartItems = await prisma.cart.findMany({
      where: { userId },
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ message: "Keranjang kosong" });
    }

    // Tentukan type booking
    const hasAsset = cartItems.some((item) => item.itemType === "ASET");
    const hasService = cartItems.some((item) => item.itemType === "JASA");
    let type = BookingType.CAMPUR;
    if (hasAsset && !hasService) type = BookingType.ASET;
    if (!hasAsset && hasService) type = BookingType.JASA;

    // Validasi ketersediaan (stock dan konflik jadwal untuk aset)
    for (const item of cartItems) {
      if (item.itemType === "ASET") {
        const asset = await prisma.asset.findUnique({
          where: { id: item.assetId },
          select: { stock: true, status: true },
        });

        if (!asset || asset.status !== "TERSEDIA") {
          return res
            .status(400)
            .json({ message: `Asset ${item.assetId} tidak tersedia` });
        }

        if (item.qty > asset.stock) {
          return res
            .status(400)
            .json({ message: `Stok asset ${item.assetId} tidak mencukupi` });
        }

        // Cek overlapping bookings untuk aset ini
        const overlapping = await prisma.bookingItem.findMany({
          where: {
            assetId: item.assetId,
            booking: {
              status: {
                in: [BookingStatus.MENUNGGU, BookingStatus.DIKONFIRMASI],
              },
              OR: [
                { startDatetime: { lte: end }, endDatetime: { gte: start } },
              ],
            },
          },
        });

        const totalBookedQty = overlapping.reduce((sum, bi) => sum + bi.qty, 0);
        if (totalBookedQty + item.qty > asset.stock) {
          return res
            .status(400)
            .json({
              message: `Asset ${item.assetId} sudah dipesan untuk periode tersebut`,
            });
        }
      } else if (item.itemType === "JASA") {
        const service = await prisma.service.findUnique({
          where: { id: item.serviceId },
          select: { isActive: true },
        });

        if (!service || !service.isActive) {
          return res
            .status(400)
            .json({ message: `Jasa ${item.serviceId} tidak tersedia` });
        }
      }
    }

    // Hitung total price (untuk referensi, meski booking ga simpan total)
    const totalPrice = cartItems.reduce(
      (sum, item) => sum.plus(item.price),
      new Decimal(0)
    );

    // Gunakan transaction untuk create booking, items, update stock, clear cart
    const booking = await prisma.$transaction(async (tx) => {
      // Create booking
      const newBooking = await tx.booking.create({
        data: {
          userId,
          type,
          startDatetime: start,
          endDatetime: end,
          status: BookingStatus.MENUNGGU,
          notes,
        },
      });

      // Create booking items
      for (const item of cartItems) {
        await tx.bookingItem.create({
          data: {
            bookingId: newBooking.id,
            itemType: item.itemType,
            assetId: item.itemType === "ASET" ? item.assetId : undefined,
            serviceId: item.itemType === "JASA" ? item.serviceId : undefined,
            qty: item.qty,
            price: item.price,
          },
        });

        // Update stock aset jika ASET
        if (item.itemType === "ASET") {
          await tx.asset.update({
            where: { id: item.assetId },
            data: { stock: { decrement: item.qty } },
          });
        }
      }

      // Clear cart
      await tx.cart.deleteMany({ where: { userId } });

      return newBooking;
    });

    // Buat notifikasi untuk user setelah booking dibuat
    // 1. Kirim notifikasi ke ADMIN dan APPROVER
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "APPROVER"] },
        status: "AKTIF",
      },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        createNotification(
          admin.id,
          NotificationType.BOOKING,
          "Booking Baru Masuk",
          `Booking baru dengan ID ${booking.id} dari user ID ${userId} sedang menunggu konfirmasi.`
        )
      )
    );

    // 2. Kirim notifikasi ke PEMINJAM sebagai pengirim booking
    await createNotification(
      userId,
      NotificationType.BOOKING,
      "Booking Anda Berhasil Diajukan",
      `Booking Anda dengan ID ${booking.id} berhasil dibuat dan sedang menunggu konfirmasi dari admin.`
    );

    res
      .status(201)
      .json({
        message: "Booking berhasil dibuat dari keranjang",
        booking,
        totalPrice: totalPrice.toString(),
      });
  } catch (error) {
    console.error("Create booking from cart error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const where = { userId };
    if (status) where.status = status.toUpperCase();

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        items: {
          include: {
            asset: { select: { name: true, code: true } },
            service: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });

    const total = await prisma.booking.count({ where });

    res.status(200).json({ bookings, total, page, limit });
  } catch (error) {
    console.error("Get user bookings error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const getBookingDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            asset: true,
            service: true,
          },
        },
        payments: true,
        fines: true,
        feedbacks: true,
      },
    });

    if (!booking || (booking.userId !== userId && req.user.role !== "ADMIN")) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    res.status(200).json(booking);
  } catch (error) {
    console.error("Get booking details error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!booking || booking.userId !== userId) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    if (
      ![BookingStatus.MENUNGGU, BookingStatus.DIKONFIRMASI].includes(
        booking.status
      )
    ) {
      return res.status(400).json({ message: "Booking tidak bisa dibatalkan" });
    }

    // Transaction: update status, kembalikan stock aset
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.DIBATALKAN },
      });

      for (const item of booking.items) {
        if (item.itemType === "ASET") {
          await tx.asset.update({
            where: { id: item.assetId },
            data: { stock: { increment: item.qty } },
          });
        }
      }
    });

    // Buat notifikasi untuk user setelah cancel
    await createNotification(
      userId,
      NotificationType.BOOKING,
      "Booking Dibatalkan",
      `Booking Anda dengan ID ${id} telah dibatalkan.`
    );

    res.status(200).json({ message: "Booking berhasil dibatalkan" });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Fungsi untuk approver/admin
const approveBooking = async (req, res) => {
  try {
    if (!["ADMIN", "APPROVER"].includes(req.user.role)) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking || booking.status !== BookingStatus.MENUNGGU) {
      return res.status(400).json({ message: "Booking tidak bisa disetujui" });
    }

    await prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.DIKONFIRMASI,
        approvedBy: req.user.id,
        approvedAt: new Date(),
        notes,
      },
    });

    // Buat notifikasi untuk user booking setelah approve
    await createNotification(
      booking.userId,
      NotificationType.BOOKING,
      "Booking Disetujui",
      `Booking Anda dengan ID ${id} telah disetujui.`
    );

    res.status(200).json({ message: "Booking berhasil disetujui" });
  } catch (error) {
    console.error("Approve booking error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const rejectBooking = async (req, res) => {
  try {
    if (!["ADMIN", "APPROVER"].includes(req.user.role)) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!booking || booking.status !== BookingStatus.MENUNGGU) {
      return res.status(400).json({ message: "Booking tidak bisa ditolak" });
    }

    // Transaction: update status, kembalikan stock aset
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.DITOLAK, notes },
      });

      for (const item of booking.items) {
        if (item.itemType === "ASET") {
          await tx.asset.update({
            where: { id: item.assetId },
            data: { stock: { increment: item.qty } },
          });
        }
      }
    });

    // Buat notifikasi untuk user booking setelah reject
    await createNotification(
      booking.userId,
      NotificationType.BOOKING,
      "Booking Ditolak",
      `Booking Anda dengan ID ${id} telah ditolak. Alasan: ${
        notes || "Tidak ada alasan yang diberikan."
      }`
    );

    res.status(200).json({ message: "Booking berhasil ditolak" });
  } catch (error) {
    console.error("Reject booking error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

module.exports = {
  createBookingFromCart,
  getUserBookings,
  getBookingDetails,
  cancelBooking,
  approveBooking,
  rejectBooking,
};
