const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const getAllCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        type: true, // ikut tampilkan type
      },
      orderBy: { name: "asc" },
    });

    res.status(200).json(categories);
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        type: true, // ikut tampilkan type
      },
    });

    if (!category) {
      return res.status(404).json({ message: "Kategori tidak ditemukan" });
    }

    res.status(200).json(category);
  } catch (error) {
    console.error("Get category error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, description, type } = req.body;

    const existing = await prisma.category.findFirst({ where: { name } });
    if (existing) {
      return res.status(400).json({ message: "Kategori sudah ada" });
    }

    const newCategory = await prisma.category.create({
      data: { name, description, type },
      select: { id: true, name: true, description: true, type: true },
    });

    res
      .status(201)
      .json({ message: "Kategori berhasil dibuat", category: newCategory });
  } catch (error) {
    console.error("Create category error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, type } = req.body;

    const category = await prisma.category.update({
      where: { id },
      data: { name, description, type },
      select: { id: true, name: true, description: true, type: true },
    });

    res
      .status(200)
      .json({ message: "Kategori berhasil diupdate", category });
  } catch (error) {
    console.error("Update category error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.category.delete({ where: { id } });
    res.status(200).json({ message: "Kategori berhasil dihapus" });
  } catch (error) {
    console.error("Delete category error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// === tambahan baru ===
const getAssetCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { type: "ASET" },
      select: { id: true, name: true, description: true, type: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(categories);
  } catch (error) {
    console.error("Get asset categories error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const getServiceCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { type: "JASA" },
      select: { id: true, name: true, description: true, type: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(categories);
  } catch (error) {
    console.error("Get service categories error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getAssetCategories,
  getServiceCategories,
};
