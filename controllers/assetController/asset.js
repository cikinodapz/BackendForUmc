const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const path = require("path");

const getAllAssets = async (req, res) => {
  try {
    const assets = await prisma.asset.findMany({
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    // prefix url biar bisa diakses
    const assetsWithUrl = assets.map(a => ({
      ...a,
      photoUrl: a.photoUrl ? `${req.protocol}://${req.get("host")}/uploads/${a.photoUrl}` : null,
    }));

    res.status(200).json(assetsWithUrl);
  } catch (error) {
    console.error("Get assets error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const getAssetById = async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    if (!asset) {
      return res.status(404).json({ message: "Aset tidak ditemukan" });
    }

    res.status(200).json(asset);
  } catch (error) {
    console.error("Get asset error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const createAsset = async (req, res) => {
  try {
    const {
      categoryId,
      code,
      name,
      specification,
      acquisitionDate,
      conditionNow,
      status,
      dailyRate,
      stock,
    } = req.body;

    const existing = await prisma.asset.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: "Kode aset sudah digunakan" });
    }

    const newAsset = await prisma.asset.create({
      data: {
        categoryId,
        code,
        name,
        specification,
        acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : null,
        conditionNow,
        status,
        dailyRate,
        stock: stock ? Number(stock) : 1,
        photoUrl: req.file ? req.file.filename : null, // simpan nama file
      },
      include: { category: { select: { id: true, name: true } } },
    });

    res.status(201).json({
      message: "Aset berhasil dibuat",
      asset: {
        ...newAsset,
        photoUrl: newAsset.photoUrl
          ? `${req.protocol}://${req.get("host")}/uploads/${newAsset.photoUrl}`
          : null,
      },
    });
  } catch (error) {
    console.error("Create asset error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const updateAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      categoryId,
      name,
      specification,
      acquisitionDate,
      conditionNow,
      status,
      dailyRate,
      stock,
    } = req.body;

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        categoryId,
        name,
        specification,
        acquisitionDate: acquisitionDate ? new Date(acquisitionDate) : null,
        conditionNow,
        status,
        dailyRate,
        stock: stock ? Number(stock) : undefined,
        photoUrl: req.file ? req.file.filename : undefined,
      },
      include: { category: { select: { id: true, name: true } } },
    });

    res.status(200).json({
      message: "Aset berhasil diupdate",
      asset: {
        ...updated,
        photoUrl: updated.photoUrl
          ? `${req.protocol}://${req.get("host")}/uploads/${updated.photoUrl}`
          : null,
      },
    });
  } catch (error) {
    console.error("Update asset error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.asset.delete({ where: { id } });
    res.status(200).json({ message: "Aset berhasil dihapus" });
  } catch (error) {
    console.error("Delete asset error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const getAssetPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await prisma.asset.findUnique({
        where: { id },
        select: { photoUrl: true },
    });

    if (!asset || !asset.photoUrl) {
        return res.status(404).json({ message: "Foto aset tidak ditemukan" });
    }
    const photoPath = path.join(__dirname, "../../uploads", asset.photoUrl);
    res.sendFile(photoPath);
    } catch (error) {
    console.error("Get asset photo error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  } 
};

module.exports = {
  getAllAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetPhoto,
};
