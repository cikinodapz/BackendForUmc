const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { read } = req.query; // read: true untuk sudah dibaca, false untuk unread, kosong untuk semua

    const where = { userId };
    if (read === 'true') {
      where.readAt = { not: null };
    } else if (read === 'false') {
      where.readAt = null;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { sentAt: "desc" },
      // Menghapus skip dan take untuk menghilangkan pagination
    });

    const total = notifications.length; // Total sekarang sama dengan jumlah notifikasi

    res.status(200).json({ notifications, total });
  } catch (error) {
    console.error("Get user notifications error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params; // Jika id ada, mark satu; jika tidak, mark all

    if (id) {
      // Mark satu notif
      const notification = await prisma.notification.findUnique({
        where: { id },
      });

      if (!notification || notification.userId !== userId) {
        return res.status(404).json({ message: "Notifikasi tidak ditemukan" });
      }

      if (notification.readAt) {
        return res.status(400).json({ message: "Notifikasi sudah dibaca" });
      }

      await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });

      res.status(200).json({ message: "Notifikasi berhasil ditandai sebagai dibaca" });
    } else {
      // Mark all unread
      await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });

      res.status(200).json({ message: "Semua notifikasi berhasil ditandai sebagai dibaca" });
    }
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

module.exports = {
  getUserNotifications,
  markAsRead,
};