const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const path = require("path");
const fs = require("fs").promises;

// Get all services
const getAllServices = async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    const servicesWithUrl = services.map((s) => ({
      ...s,
      photoUrl: s.photoUrl
        ? `${req.protocol}://${req.get("host")}/uploads/${s.photoUrl}`
        : null,
    }));

    res.status(200).json(servicesWithUrl);
  } catch (error) {
    console.error("Get services error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Get service by ID
const getServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await prisma.service.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } } },
    });

    if (!service)
      return res.status(404).json({ message: "Service tidak ditemukan" });

    res.status(200).json({
      ...service,
      photoUrl: service.photoUrl
        ? `${req.protocol}://${req.get("host")}/uploads/${service.photoUrl}`
        : null,
    });
  } catch (error) {
    console.error("Get service error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Create service
const createService = async (req, res) => {
  try {
    let { categoryId, code, name, description, unitRate, isActive } = req.body;

    // 🔑 parse isActive biar selalu boolean
    isActive = isActive === "true" || isActive === true;

    const existing = await prisma.service.findUnique({ where: { code } });
    if (existing)
      return res.status(400).json({ message: "Kode service sudah digunakan" });

    const newService = await prisma.service.create({
      data: {
        code,
        name,
        description,
        unitRate,
        isActive,
        photoUrl: req.file ? req.file.filename : null,
        category: categoryId ? { connect: { id: categoryId } } : undefined, // kalau null/undefined, biarin kosong
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({
      message: "Service berhasil dibuat",
      service: {
        ...newService,
        photoUrl: newService.photoUrl
          ? `${req.protocol}://${req.get("host")}/uploads/${
              newService.photoUrl
            }`
          : null,
      },
    });
  } catch (error) {
    console.error("Create service error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Update service
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    let { categoryId, name, description, unitRate, isActive } = req.body;

    // 🔑 parse isActive juga
    isActive = isActive === "true" || isActive === true;

    const updated = await prisma.service.update({
      where: { id },
      data: {
        categoryId: categoryId || null,
        name,
        description,
        unitRate,
        isActive,
        photoUrl: req.file ? req.file.filename : undefined,
      },
      include: { category: { select: { id: true, name: true } } },
    });

    res.status(200).json({
      message: "Service berhasil diupdate",
      service: {
        ...updated,
        photoUrl: updated.photoUrl
          ? `${req.protocol}://${req.get("host")}/uploads/${updated.photoUrl}`
          : null,
      },
    });
  } catch (error) {
    console.error("Update service error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Delete service
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.service.delete({ where: { id } });
    res.status(200).json({ message: "Service berhasil dihapus" });
  } catch (error) {
    console.error("Delete service error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Get service photo
const getServicePhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await prisma.service.findUnique({
      where: { id },
      select: { photoUrl: true },
    });

    if (!service || !service.photoUrl) {
      return res.status(404).json({ message: "Foto service tidak ditemukan" });
    }

    const photoPath = path.join(__dirname, "../../uploads", service.photoUrl);

    // Check if the file exists
    try {
      await fs.access(photoPath); // Throws if file doesn't exist or isn't accessible
    } catch (error) {
      return res.status(404).json({ message: "Foto service tidak ditemukan" });
    }

    res.sendFile(photoPath);
  } catch (error) {
    console.error("Get service photo error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

module.exports = {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getServicePhoto,
};
