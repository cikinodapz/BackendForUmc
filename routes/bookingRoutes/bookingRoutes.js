const express = require("express");
const router = express.Router();
const {
  createBookingFromCart,
  createBooking,
  getBookingsByUser,
  updateBooking,
  cancelBooking,
  getAllBookings,
  getBookingById,
  confirmBooking,
  rejectBooking,
  completeBooking
} = require("../../controllers/bookingController/booking");
const authMiddleware = require("../../middlewares/authMiddleware");

//utk user yg sudah login
router.post("/checkout", authMiddleware, createBookingFromCart); // buat booking dari cart
router.post("/", authMiddleware, createBooking);                  // buat booking manual
router.get("/", authMiddleware, getBookingsByUser);               // lihat semua booking user
router.patch("/:id", authMiddleware, updateBooking);              // update booking
router.delete("/:id", authMiddleware, cancelBooking);             // batalkan booking

// utk admin (belum dibuat middleware khusus admin)
router.get("/admin/all", authMiddleware, getAllBookings);               // Lihat semua booking
router.get("/:id", authMiddleware, getBookingById);            // Lihat detail booking by ID
router.patch("/:id/confirm", authMiddleware, confirmBooking);  // Konfirmasi booking
router.patch("/:id/reject", authMiddleware, rejectBooking);    // Tolak booking
router.patch("/:id/complete", authMiddleware, completeBooking);// Selesaikan booking

module.exports = router;