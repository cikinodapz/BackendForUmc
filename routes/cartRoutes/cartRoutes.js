const express = require("express");
const router = express.Router();
const {
  addToCart,
  getCart,
  updateCartItem,
  deleteCartItem,
  clearCart,
} = require("../../controllers/cartController/cart");
const authMiddleware = require("../../middlewares/authMiddleware");

router.post("/", authMiddleware, addToCart);       // tambah item
router.get("/", authMiddleware, getCart);          // lihat keranjang
router.patch("/:id", authMiddleware, updateCartItem); // update item
router.delete("/:id", authMiddleware, deleteCartItem); // hapus item tertentu
router.delete("/", authMiddleware, clearCart);     // hapus semua item

module.exports = router;
