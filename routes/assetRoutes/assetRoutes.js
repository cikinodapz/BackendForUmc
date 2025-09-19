const express = require("express");
const router = express.Router();
const {
  getAllAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetPhoto,
} = require("../../controllers/assetController/asset");
const upload = require("../../middlewares/upload");
const authMiddleware = require("../../middlewares/authMiddleware");

router.get("/",authMiddleware, getAllAssets);
router.get("/:id",authMiddleware, getAssetById);
router.post("/",authMiddleware, upload.single("photo"), createAsset);
router.patch("/:id",authMiddleware, upload.single("photo"), updateAsset);
router.delete("/:id",authMiddleware, deleteAsset);
router.get("/photo/:id",authMiddleware, getAssetPhoto);

module.exports = router;
