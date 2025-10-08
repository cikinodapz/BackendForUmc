const express = require("express");
const router = express.Router();
const {
  addToCart,
  updateCartItem,
  clearCart,
  getCartByUser,
  removeFromCart,
} = require("../../controllers/cartController/cart");
const authMiddleware = require("../../middlewares/authMiddleware");

router.post("/", authMiddleware, addToCart);       // tambah item
router.get("/", authMiddleware, getCartByUser);          // lihat keranjang
router.patch("/:id", authMiddleware, updateCartItem); // update item
router.delete("/:id", authMiddleware, removeFromCart); // hapus item tertentu
router.delete("/", authMiddleware, clearCart);     // hapus semua item

module.exports = router;
