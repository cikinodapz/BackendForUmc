const express = require("express");
const router = express.Router();
const {
  createBookingFromCart,
  getUserBookings,
  getBookingDetails,
  cancelBooking,
  approveBooking,
  rejectBooking,
} = require("../../controllers/bookingController/booking"); // Sesuaikan path
const authMiddleware = require("../../middlewares/authMiddleware");

router.post("/checkout", authMiddleware, createBookingFromCart); // Checkout dari cart
router.get("/", authMiddleware, getUserBookings);                // List booking user
router.get("/:id", authMiddleware, getBookingDetails);          // Detail booking
router.patch("/:id/cancel", authMiddleware, cancelBooking);     // Cancel booking
router.patch("/:id/approve", authMiddleware, approveBooking);   // Approve (admin/approver)
router.patch("/:id/reject", authMiddleware, rejectBooking);     // Reject (admin/approver)

module.exports = router;