const express = require("express");
const router = express.Router();
const upload = require("../../middlewares/upload");

const {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getServicePhoto,
} = require("../../controllers/serviceController/service");
const authMiddleware = require("../../middlewares/authMiddleware");

router.get("/",authMiddleware, getAllServices);
router.get("/:id",authMiddleware, getServiceById);
router.get("/photo/:id",authMiddleware, getServicePhoto);
router.post("/",authMiddleware, upload.single("photo"), createService);
router.patch("/:id",authMiddleware, upload.single("photo"), updateService);
router.delete("/:id",authMiddleware, deleteService);

module.exports = router;
