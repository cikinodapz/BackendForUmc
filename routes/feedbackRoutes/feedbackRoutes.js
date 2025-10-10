const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middlewares/authMiddleware");
const {
  createFeedback,
  getMyFeedbacks,
  getAllFeedbacks,
  getFeedbackByBooking,
  getMyFeedbackDetailByBooking,
} = require("../../controllers/feedbackController/feedback");

// User endpoints
router.post("/", authMiddleware, createFeedback);
router.get("/my", authMiddleware, getMyFeedbacks);
router.get("/my/by-booking/:bookingId", authMiddleware, getMyFeedbackDetailByBooking);

// Admin endpoints (no dedicated admin middleware yet, follow existing pattern)
router.get("/admin/all", authMiddleware, getAllFeedbacks);

// Public/admin: by booking
router.get("/by-booking/:bookingId", authMiddleware, getFeedbackByBooking);

module.exports = router;
