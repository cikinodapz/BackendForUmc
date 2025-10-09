const express = require("express");
const router = express.Router();
const {
  createPayment,
  getPaymentDetails,
  checkPaymentStatus,
  listPayments
} = require("../../controllers/paymentController/payment"); // Sesuaikan path
const authMiddleware = require("../../middlewares/authMiddleware");

// Endpoint untuk create payment dari booking yang sudah dikonfirmasi
router.post("/create/:bookingId", authMiddleware, createPayment);

// List payments (admin semua, user miliknya)
router.get("/", authMiddleware, listPayments);

// Endpoint untuk get detail payment
router.get("/:id", authMiddleware, getPaymentDetails);

// Notification dari Midtrans (tidak perlu auth, tapi verifikasi internal)
router.post("/notification", (req, res) => {
  require("../../controllers/paymentController/payment").handleMidtransNotification(req, res);
});

router.get('/:paymentId/status', authMiddleware, checkPaymentStatus); 

module.exports = router;
