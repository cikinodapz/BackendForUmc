const express = require("express");
const router = express.Router();
const {
  getUserNotifications,
  markAsRead,
} = require("../../controllers/notificationController/notification"); // Sesuaikan path
const authMiddleware = require("../../middlewares/authMiddleware");

router.get("/", authMiddleware, getUserNotifications);          // List notif user
router.patch("/read", authMiddleware, markAsRead);              // Mark all as read (no id)
router.patch("/:id/read", authMiddleware, markAsRead);          // Mark one as read (with id)

module.exports = router;