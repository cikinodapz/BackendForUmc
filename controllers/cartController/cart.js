const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const addToCart = async (req, res) => {
  try {
    const userId = req.user.id; // Asumsi authMiddleware menyediakan req.user.id
    const { itemType, assetId, serviceId, qty = 1 } = req.body;

    if (!itemType || (itemType !== "ASET" && itemType !== "JASA")) {
      return res.status(400).json({ message: "Tipe item tidak valid" });
    }

    let price = 0;
    let item;

    if (itemType === "ASET") {
      if (!assetId) {
        return res.status(400).json({ message: "Asset ID diperlukan untuk tipe ASET" });
      }
      item = await prisma.asset.findUnique({
        where: { id: assetId },
        select: { dailyRate: true, stock: true, status: true },
      });
      if (!item) {
        return res.status(404).json({ message: "Asset tidak ditemukan" });
      }
      if (item.status !== "TERSEDIA") {
        return res.status(400).json({ message: "Asset tidak tersedia" });
      }
      if (qty > item.stock) {
        return res.status(400).json({ message: "Stok asset tidak mencukupi" });
      }
      price = item.dailyRate.times(qty); // Asumsi price = dailyRate * qty (untuk jumlah unit)
    } else if (itemType === "JASA") {
      if (!serviceId) {
        return res.status(400).json({ message: "Service ID diperlukan untuk tipe JASA" });
      }
      item = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { unitRate: true, isActive: true },
      });
      if (!item) {
        return res.status(404).json({ message: "Jasa tidak ditemukan" });
      }
      if (!item.isActive) {
        return res.status(400).json({ message: "Jasa tidak aktif" });
      }
      price = item.unitRate.times(qty); // Asumsi price = unitRate * qty
    }

    // Cek jika item sudah ada di cart, update qty jika ada
    const existingCartItem = await prisma.cart.findFirst({
      where: {
        userId,
        itemType,
        assetId: itemType === "ASET" ? assetId : null,
        serviceId: itemType === "JASA" ? serviceId : null,
      },
    });

    let cartItem;
    if (existingCartItem) {
      const newQty = existingCartItem.qty + qty;
      let newPrice;
      if (itemType === "ASET") {
        if (newQty > item.stock) {
          return res.status(400).json({ message: "Stok asset tidak mencukupi untuk update" });
        }
        newPrice = item.dailyRate.times(newQty);
      } else {
        newPrice = item.unitRate.times(newQty);
      }
      cartItem = await prisma.cart.update({
        where: { id: existingCartItem.id },
        data: { qty: newQty, price: newPrice },
      });
    } else {
      cartItem = await prisma.cart.create({
        data: {
          userId,
          itemType,
          assetId: itemType === "ASET" ? assetId : undefined,
          serviceId: itemType === "JASA" ? serviceId : undefined,
          qty,
          price,
        },
      });
    }

    res.status(201).json({ message: "Item berhasil ditambahkan ke keranjang", cartItem });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const getCart = async (req, res) => {
  try {
    const userId = req.user.id; // Asumsi dari authMiddleware
    const cartItems = await prisma.cart.findMany({
      where: { userId },
      include: {
        asset: {
          select: { code: true, name: true, photoUrl: true },
        },
        service: {
          select: { code: true, name: true, photoUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(cartItems);
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const updateCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { qty } = req.body;

    if (qty <= 0) {
      return res.status(400).json({ message: "Quantity harus lebih dari 0" });
    }

    const cartItem = await prisma.cart.findUnique({
      where: { id },
    });

    if (!cartItem || cartItem.userId !== userId) {
      return res.status(404).json({ message: "Item keranjang tidak ditemukan" });
    }

    let item;
    let newPrice;
    if (cartItem.itemType === "ASET") {
      item = await prisma.asset.findUnique({
        where: { id: cartItem.assetId },
        select: { dailyRate: true, stock: true },
      });
      if (qty > item.stock) {
        return res.status(400).json({ message: "Stok asset tidak mencukupi" });
      }
      newPrice = item.dailyRate.times(qty);
    } else {
      item = await prisma.service.findUnique({
        where: { id: cartItem.serviceId },
        select: { unitRate: true },
      });
      newPrice = item.unitRate.times(qty);
    }

    const updatedItem = await prisma.cart.update({
      where: { id },
      data: { qty, price: newPrice },
    });

    res.status(200).json({ message: "Item keranjang berhasil diupdate", updatedItem });
  } catch (error) {
    console.error("Update cart item error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const deleteCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const cartItem = await prisma.cart.findUnique({
      where: { id },
    });

    if (!cartItem || cartItem.userId !== userId) {
      return res.status(404).json({ message: "Item keranjang tidak ditemukan" });
    }

    await prisma.cart.delete({
      where: { id },
    });

    res.status(200).json({ message: "Item keranjang berhasil dihapus" });
  } catch (error) {
    console.error("Delete cart item error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    await prisma.cart.deleteMany({
      where: { userId },
    });

    res.status(200).json({ message: "Semua item keranjang berhasil dihapus" });
  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

module.exports = {
  addToCart,
  getCart,
  updateCartItem,
  deleteCartItem,
  clearCart,
};