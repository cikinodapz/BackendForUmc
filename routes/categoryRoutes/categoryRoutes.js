const express = require("express");
const router = express.Router();
const {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getAssetCategories,
  getServiceCategories,
} = require("../../controllers/categoryController/category");
const authMiddleware = require("../../middlewares/authMiddleware");

router.get("/",authMiddleware, getAllCategories);
router.get("/:id",authMiddleware, getCategoryById);
router.post("/",authMiddleware, createCategory);
router.patch("/:id",authMiddleware, updateCategory);
router.delete("/:id",authMiddleware, deleteCategory);
router.get("/type/aset", getAssetCategories);
router.get("/type/jasa", getServiceCategories);

module.exports = router;
