const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Get detailed feedback for current user by booking
async function getMyFeedbackDetailByBooking(req, res) {
  try {
    const userId = req.user.id;
    const { bookingId } = req.params;

    if (!bookingId) return res.status(400).json({ message: "bookingId diperlukan" });

    const fb = await prisma.feedback.findFirst({
      where: { bookingId, userId },
      include: {
        booking: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            items: {
              include: {
                service: { include: { category: { select: { id: true, name: true } } } },
                package: true,
                asset: true,
              },
            },
            payments: true,
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!fb) return res.status(404).json({ message: "Feedback tidak ditemukan untuk booking ini" });

    // Build a small summary similar to payments detail style
    const booking = fb.booking;
    const durationDays = booking.startDate && booking.endDate
      ? Math.ceil((new Date(booking.endDate) - new Date(booking.startDate)) / (1000*60*60*24)) + 1
      : null;
    const subtotalSum = (booking.items || []).reduce((acc, it) => acc + Number(it.subtotal || 0), 0);

    const payload = {
      feedback: {
        id: fb.id,
        rating: fb.rating,
        comment: fb.comment,
        createdAt: fb.createdAt,
      },
      booking: {
        id: booking.id,
        startDate: booking.startDate,
        endDate: booking.endDate,
        totalAmount: booking.totalAmount,
        status: booking.status,
        user: booking.user,
        items: booking.items,
      },
      summary: {
        durationDays,
        subtotalSum,
        paymentCount: (booking.payments || []).length,
        latestPaymentStatus: booking.payments && booking.payments.length > 0 ? booking.payments[booking.payments.length - 1].status : null,
      },
      payments: booking.payments,
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Get my feedback detail by booking error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
}

// Create feedback by user for a completed booking they own
async function createFeedback(req, res) {
  try {
    const userId = req.user.id;
    const { bookingId, rating, comment } = req.body || {};

    if (!bookingId) return res.status(400).json({ message: "bookingId diperlukan" });
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ message: "rating harus 1-5" });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId },
      select: { id: true, status: true },
    });

    if (!booking) return res.status(404).json({ message: "Booking tidak ditemukan" });
    if (booking.status !== "SELESAI") {
      return res.status(400).json({ message: "Feedback hanya bisa untuk booking yang sudah selesai" });
    }

    // Cegah duplicate feedback untuk booking yang sama oleh user yang sama
    const existing = await prisma.feedback.findFirst({ where: { bookingId, userId } });
    if (existing) {
      return res.status(409).json({ message: "Feedback untuk booking ini sudah ada" });
    }

    const fb = await prisma.feedback.create({
      data: {
        bookingId,
        userId,
        rating: r,
        comment: comment || null,
      },
    });

    return res.status(201).json({ message: "Feedback berhasil dibuat", feedback: fb });
  } catch (error) {
    console.error("Create feedback error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
}

// Get current user's feedbacks
async function getMyFeedbacks(req, res) {
  try {
    const userId = req.user.id;
    const feedbacks = await prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        booking: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            totalAmount: true,
            items: {
              select: {
                id: true,
                type: true,
                quantity: true,
                unitPrice: true,
                subtotal: true,
                service: { select: { id: true, name: true } },
                asset: { select: { id: true, name: true } },
                package: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    return res.status(200).json(feedbacks);
  } catch (error) {
    console.error("Get my feedbacks error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
}

// Admin: list all feedbacks (optional filters: rating, bookingId, userId)
async function getAllFeedbacks(req, res) {
  try {
    const { rating, bookingId, userId } = req.query;
    const where = {};
    if (rating) where.rating = Number(rating);
    if (bookingId) where.bookingId = String(bookingId);
    if (userId) where.userId = String(userId);

    const feedbacks = await prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        booking: {
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            totalAmount: true,
          },
        },
      },
    });
    return res.status(200).json(feedbacks);
  } catch (error) {
    console.error("Get all feedbacks error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
}

// Get feedback by booking
async function getFeedbackByBooking(req, res) {
  try {
    const { bookingId } = req.params;
    const feedback = await prisma.feedback.findMany({
      where: { bookingId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        booking: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            items: {
              include: {
                service: { include: { category: { select: { id: true, name: true } } } },
                asset: { include: { category: { select: { id: true, name: true } } } },
                package: true,
              },
            },
          },
        },
      },
    });
    return res.status(200).json(feedback);
  } catch (error) {
    console.error("Get feedback by booking error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
}

module.exports = {
  createFeedback,
  getMyFeedbacks,
  getAllFeedbacks,
  getFeedbackByBooking,
  getMyFeedbackDetailByBooking,
};
