const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Get cart by user
const getCartByUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const cartItems = await prisma.cart.findMany({
      where: { userId },
      include: {
        service: {
          include: {
            category: { select: { id: true, name: true } },
            Package: true
          }
        },
        package: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(cartItems);
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Add to cart
const addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { serviceId, packageId, quantity = 1, notes } = req.body;

    // Validasi input
    if (!serviceId) {
      return res.status(400).json({ message: "Service ID diperlukan" });
    }

    // Cek apakah service exists dan aktif
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, isActive: true, name: true }
    });

    if (!service) {
      return res.status(404).json({ message: "Service tidak ditemukan" });
    }

    if (!service.isActive) {
      return res.status(400).json({ message: "Service tidak aktif" });
    }

    // Jika packageId diberikan, cek apakah package exists
    if (packageId) {
      const package = await prisma.package.findUnique({
        where: { id: packageId },
        select: { id: true, serviceId: true, name: true }
      });

      if (!package) {
        return res.status(404).json({ message: "Paket tidak ditemukan" });
      }

      if (package.serviceId !== serviceId) {
        return res.status(400).json({ message: "Paket tidak sesuai dengan service" });
      }
    }

    // Build where condition untuk mencari item cart yang sudah ada
    const whereCondition = {
      userId,
      serviceId,
      packageId: packageId || null
    };

    // Cek apakah item sudah ada di cart
    const existingCartItem = await prisma.cart.findFirst({
      where: whereCondition
    });

    let cartItem;

    if (existingCartItem) {
      // Update quantity jika sudah ada
      cartItem = await prisma.cart.update({
        where: { id: existingCartItem.id },
        data: {
          quantity: existingCartItem.quantity + quantity,
          notes: notes || existingCartItem.notes,
          updatedAt: new Date()
        },
        include: {
          service: {
            include: {
              category: { select: { id: true, name: true } },
              Package: true
            }
          },
          package: true
        }
      });
    } else {
      // Buat item baru
      cartItem = await prisma.cart.create({
        data: {
          userId,
          serviceId,
          packageId: packageId || null,
          quantity,
          notes: notes || null
        },
        include: {
          service: {
            include: {
              category: { select: { id: true, name: true } },
              Package: true
            }
          },
          package: true
        }
      });
    }

    res.status(200).json({
      message: "Berhasil ditambahkan ke keranjang",
      cartItem
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    
    if (error.code === 'P2002') {
      return res.status(400).json({ message: "Item sudah ada di keranjang" });
    }
    
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Update cart item
const updateCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { quantity, notes } = req.body;

    // Validasi quantity
    if (quantity !== undefined && (quantity < 1 || quantity > 100)) {
      return res.status(400).json({ message: "Quantity harus antara 1-100" });
    }

    // Cek apakah cart item milik user
    const existingCartItem = await prisma.cart.findFirst({
      where: { id, userId }
    });

    if (!existingCartItem) {
      return res.status(404).json({ message: "Item keranjang tidak ditemukan" });
    }

    const cartItem = await prisma.cart.update({
      where: { id },
      data: {
        ...(quantity !== undefined && { quantity }),
        ...(notes !== undefined && { notes }),
        updatedAt: new Date()
      },
      include: {
        service: {
          include: {
            category: { select: { id: true, name: true } },
            Package: true
          }
        },
        package: true
      }
    });

    res.status(200).json({
      message: "Keranjang berhasil diupdate",
      cartItem
    });
  } catch (error) {
    console.error("Update cart error:", error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Item keranjang tidak ditemukan" });
    }
    
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Remove from cart
const removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Cek apakah cart item milik user
    const existingCartItem = await prisma.cart.findFirst({
      where: { id, userId }
    });

    if (!existingCartItem) {
      return res.status(404).json({ message: "Item keranjang tidak ditemukan" });
    }

    await prisma.cart.delete({
      where: { id }
    });

    res.status(200).json({
      message: "Item berhasil dihapus dari keranjang"
    });
  } catch (error) {
    console.error("Remove from cart error:", error);
    
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Item keranjang tidak ditemukan" });
    }
    
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Clear cart
const clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    await prisma.cart.deleteMany({
      where: { userId }
    });

    res.status(200).json({
      message: "Keranjang berhasil dikosongkan"
    });
  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

module.exports = {
  getCartByUser,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
};