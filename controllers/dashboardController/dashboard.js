const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// GET /dashboard/user
// Ringkasan data untuk dashboard user yang sedang login
async function getUserDashboard(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const now = new Date();

    const [
      userProfile,
      cartCount,
      totalBookings,
      waitingBookings,
      confirmedBookings,
      rejectedBookings,
      canceledBookings,
      completedBookings,
      unreadNotifications,
      feedbackCount,
      paymentsPending,
      nextUpcomingBooking,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, phone: true, photoUrl: true, role: true, status: true },
      }),
      prisma.cart.count({ where: { userId } }),
      prisma.booking.count({ where: { userId } }),
      prisma.booking.count({ where: { userId, status: "MENUNGGU" } }),
      prisma.booking.count({ where: { userId, status: "DIKONFIRMASI" } }),
      prisma.booking.count({ where: { userId, status: "DITOLAK" } }),
      prisma.booking.count({ where: { userId, status: "DIBATALKAN" } }),
      prisma.booking.count({ where: { userId, status: "SELESAI" } }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.feedback.count({ where: { userId } }),
      prisma.payment.count({ where: { status: "PENDING", booking: { userId } } }),
      prisma.booking.findFirst({
        where: { userId, status: "DIKONFIRMASI", startDate: { gte: now } },
        orderBy: { startDate: "asc" },
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
              asset: { select: { id: true, name: true, code: true } },
              package: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    // Hitung item aset yang aktif dalam booking berjalan (MENUNGGU/DIKONFIRMASI)
    const activeAssetItems = await prisma.bookingItem.count({
      where: {
        type: "ASET",
        booking: { userId, status: { in: ["MENUNGGU", "DIKONFIRMASI"] } },
      },
    });

    return res.json({
      user: userProfile,
      cart: { count: cartCount },
      bookings: {
        total: totalBookings,
        waiting: waitingBookings,
        confirmed: confirmedBookings,
        rejected: rejectedBookings,
        canceled: canceledBookings,
        completed: completedBookings,
        nextUpcoming: nextUpcomingBooking,
      },
      assetsBorrowed: activeAssetItems,
      notifications: { unread: unreadNotifications },
      feedback: { count: feedbackCount },
      payments: { pending: paymentsPending },
    });
  } catch (err) {
    console.error("getUserDashboard error:", err);
    return res.status(500).json({ message: "Gagal memuat dashboard user", error: String(err?.message || err) });
  }
}

// GET /dashboard/admin
// Ringkasan data untuk dashboard admin
async function getAdminDashboard(req, res) {
  try {
    const role = req.user?.role;
    if (role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden: Admin only" });
    }

    const [
      usersTotal,
      usersActive,
      assetsTotal,
      assetsAvailable,
      assetsBorrowed,
      assetsInactive,
      servicesActive,
      packagesTotal,
      categoriesTotal,
      bookingWaiting,
      bookingConfirmed,
      bookingRejected,
      bookingCanceled,
      bookingCompleted,
      payPending,
      payPaid,
      payFailed,
      payRefunded,
      revenuePaid,
      feedbackTotal,
      unreadNotificationsAll,
      recentBookings,
      recentPayments,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "AKTIF" } }),
      prisma.asset.count(),
      prisma.asset.count({ where: { status: "TERSEDIA" } }),
      prisma.asset.count({ where: { status: "DIPINJAM" } }),
      prisma.asset.count({ where: { status: "TIDAK_AKTIF" } }),
      prisma.service.count({ where: { isActive: true } }),
      prisma.package.count(),
      prisma.category.count(),
      prisma.booking.count({ where: { status: "MENUNGGU" } }),
      prisma.booking.count({ where: { status: "DIKONFIRMASI" } }),
      prisma.booking.count({ where: { status: "DITOLAK" } }),
      prisma.booking.count({ where: { status: "DIBATALKAN" } }),
      prisma.booking.count({ where: { status: "SELESAI" } }),
      prisma.payment.count({ where: { status: "PENDING" } }),
      prisma.payment.count({ where: { status: "PAID" } }),
      prisma.payment.count({ where: { status: "FAILED" } }),
      prisma.payment.count({ where: { status: "REFUNDED" } }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "PAID" } }),
      prisma.feedback.count(),
      prisma.notification.count({ where: { readAt: null } }),
      prisma.booking.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          type: true,
          totalAmount: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.payment.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          status: true,
          method: true,
          createdAt: true,
          booking: { select: { id: true, user: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    return res.json({
      totals: {
        users: { total: usersTotal, active: usersActive },
        assets: {
          total: assetsTotal,
          available: assetsAvailable,
          borrowed: assetsBorrowed,
          inactive: assetsInactive,
        },
        services: { active: servicesActive },
        packages: packagesTotal,
        categories: categoriesTotal,
      },
      bookings: {
        waiting: bookingWaiting,
        confirmed: bookingConfirmed,
        rejected: bookingRejected,
        canceled: bookingCanceled,
        completed: bookingCompleted,
      },
      payments: {
        pending: payPending,
        paid: payPaid,
        failed: payFailed,
        refunded: payRefunded,
        revenuePaid: revenuePaid && revenuePaid._sum && revenuePaid._sum.amount ? Number(revenuePaid._sum.amount) : 0,
      },
      feedback: { total: feedbackTotal },
      notifications: { unreadAllUsers: unreadNotificationsAll },
      recent: {
        bookings: recentBookings,
        payments: recentPayments,
      },
    });
  } catch (err) {
    console.error("getAdminDashboard error:", err);
    return res.status(500).json({ message: "Gagal memuat dashboard admin", error: String(err?.message || err) });
  }
}

module.exports = { getUserDashboard, getAdminDashboard };
 
// GET /dashboard/admin/stats?start=ISO&end=ISO&interval=day|week|month
// Menghasilkan time series statistik booking untuk admin
async function getAdminBookingTimeSeries(req, res) {
  try {
    const role = req.user?.role;
    if (role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden: Admin only" });
    }

    const { start, end, interval } = req.query || {};
    const iv = (interval || 'day').toLowerCase();
    const allowed = ['day', 'week', 'month'];
    const bucket = allowed.includes(iv) ? iv : 'day';

    const endDate = end ? new Date(end) : new Date();
    const startDate = start ? new Date(start) : new Date(endDate.getTime() - 29 * 24 * 60 * 60 * 1000);

    // Ambil data booking dalam rentang
    const rows = await prisma.booking.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      select: { createdAt: true, status: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    // Helper untuk normalisasi bucket key
    function keyFor(date) {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      if (bucket === 'day') {
        return d.toISOString().slice(0, 10); // YYYY-MM-DD
      }
      if (bucket === 'week') {
        // ISO week: find Monday of the week
        const day = d.getUTCDay() || 7; // 1..7
        const monday = new Date(d);
        monday.setUTCDate(d.getUTCDate() - (day - 1));
        return monday.toISOString().slice(0, 10);
      }
      if (bucket === 'month') {
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; // YYYY-MM
      }
      return d.toISOString().slice(0, 10);
    }

    // Build empty buckets between start and end
    const buckets = new Map();
    function addBucket(date) {
      const k = keyFor(date);
      if (!buckets.has(k)) {
        buckets.set(k, { key: k, total: 0, amount: 0, byStatus: { MENUNGGU: 0, DIKONFIRMASI: 0, DITOLAK: 0, DIBATALKAN: 0, SELESAI: 0 } });
      }
    }

    // Initialize buckets timeline
    const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const endUtc = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
    while (cursor <= endUtc) {
      addBucket(cursor);
      if (bucket === 'day') {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      } else if (bucket === 'week') {
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      } else {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    // Aggregate
    for (const r of rows) {
      const k = keyFor(r.createdAt);
      if (!buckets.has(k)) {
        buckets.set(k, { key: k, total: 0, amount: 0, byStatus: { MENUNGGU: 0, DIKONFIRMASI: 0, DITOLAK: 0, DIBATALKAN: 0, SELESAI: 0 } });
      }
      const b = buckets.get(k);
      b.total += 1;
      // totalAmount bisa Decimal; konversi ke number aman untuk ringkasan
      const amt = Number(r.totalAmount || 0);
      b.amount += isNaN(amt) ? 0 : amt;
      const st = r.status;
      if (b.byStatus[st] !== undefined) b.byStatus[st] += 1;
    }

    // Serialize in chronological order
    const timeline = Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    return res.json({
      range: { start: startDate.toISOString(), end: endDate.toISOString(), interval: bucket },
      timeline,
    });
  } catch (err) {
    console.error('getAdminBookingTimeSeries error:', err);
    return res.status(500).json({ message: 'Gagal memuat statistik time series', error: String(err?.message || err) });
  }
}

module.exports.getAdminBookingTimeSeries = getAdminBookingTimeSeries;
