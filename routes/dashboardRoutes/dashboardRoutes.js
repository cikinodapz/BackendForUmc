const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middlewares/authMiddleware");
const { getUserDashboard, getAdminDashboard, getAdminBookingTimeSeries } = require("../../controllers/dashboardController/dashboard");

// Semua endpoint dashboard perlu auth
router.use(authMiddleware);

// Dashboard untuk user yang login
router.get("/user", getUserDashboard);

// Dashboard untuk admin
router.get("/admin", getAdminDashboard);
router.get("/admin/stats", getAdminBookingTimeSeries);

module.exports = router;
