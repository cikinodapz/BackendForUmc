const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const path = require("path");
const fs = require("fs").promises;

// Fungsi buat parse packages dari form-data
function parsePackages(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Normalisasi packages termasuk features
function normalizePackages(arr) {
  return arr
    .map((p) => ({
      name: (p.name || "").toString().trim(),
      description: p.description ? String(p.description) : null,
      unitRate: p.unitRate === undefined || p.unitRate === null ? "0" : String(p.unitRate),
      features: p.features !== undefined ? p.features : null, // 🆕 TAMBAH FEATURES
    }))
    .filter((p) => p.name.length > 0);
}

// Get all services (include packages + features)
const getAllServices = async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      include: {
        category: { select: { id: true, name: true } },
        Package: {
          orderBy: { createdAt: 'asc' }
        },
      },
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

// Get single service (include packages + features)
const getServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        Package: {
          orderBy: { createdAt: 'asc' }
        },
      },
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

// Create service + packages sekaligus
const createService = async (req, res) => {
  try {
    let { categoryId, name, description, unitRate, isActive, packages } = req.body;

    // boolean sanitize
    isActive = isActive === "true" || isActive === true;

    // Parse packages dari form-data
    const pkgRaw = parsePackages(packages);
    const pkgData = normalizePackages(pkgRaw);

    // unitRate default "0" jika kosong
    const safeUnitRate = unitRate === undefined || unitRate === null || unitRate === "" ? "0" : String(unitRate);

    const created = await prisma.service.create({
      data: {
        name,
        description: description || null,
        unitRate: safeUnitRate,
        isActive: isActive ?? true,
        photoUrl: req.file ? req.file.filename : null,
        category: categoryId ? { connect: { id: categoryId } } : undefined,
        // 🆕 BUAT PACKAGES SEKALIGUS DENGAN FEATURES
        ...(pkgData.length > 0 ? {
          Package: {
            create: pkgData.map((p) => ({
              name: p.name,
              description: p.description,
              unitRate: p.unitRate,
              features: p.features, // ✅ INCLUDED FEATURES
            })),
          },
        } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        Package: {
          orderBy: { createdAt: 'asc' }
        },
      },
    });

    res.status(201).json({
      message: "Service berhasil dibuat" + (pkgData.length > 0 ? ` dengan ${pkgData.length} paket` : ""),
      service: {
        ...created,
        photoUrl: created.photoUrl
          ? `${req.protocol}://${req.get("host")}/uploads/${created.photoUrl}`
          : null,
      },
    });
  } catch (error) {
    console.error("Create service error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Update service + replace semua packages
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    let { categoryId, name, description, unitRate, isActive, packages } = req.body;

    // boolean sanitize
    isActive = isActive === "true" || isActive === true;

    // unitRate: hanya update jika dikirim
    const dataToUpdate = {
      categoryId: categoryId === "" ? null : categoryId ?? undefined,
      name: name ?? undefined,
      description: description === "" ? null : description ?? undefined,
      isActive: typeof isActive === "boolean" ? isActive : undefined,
      photoUrl: req.file ? req.file.filename : undefined,
      ...(unitRate !== undefined ? { unitRate: String(unitRate) } : {}),
    };

    // Handle packages - replace semua yang lama
    const pkgProvided = packages !== undefined;
    const pkgRaw = parsePackages(packages);
    const pkgData = normalizePackages(pkgRaw);

    let updated;

    await prisma.$transaction(async (tx) => {
      if (pkgProvided) {
        // Hapus semua paket lama
        await tx.package.deleteMany({ where: { serviceId: id } });
        
        // Buat paket baru (kalau ada) dengan features
        if (pkgData.length > 0) {
          await tx.package.createMany({
            data: pkgData.map((p) => ({
              serviceId: id,
              name: p.name,
              description: p.description,
              unitRate: p.unitRate,
              features: p.features, // ✅ INCLUDED FEATURES
            })),
          });
        }
      }

      // Update service
      updated = await tx.service.update({
        where: { id },
        data: dataToUpdate,
        include: {
          category: { select: { id: true, name: true } },
          Package: {
            orderBy: { createdAt: 'asc' }
          },
        },
      });
    });

    res.status(200).json({
      message: "Service berhasil diupdate" + (pkgProvided ? ` dengan ${pkgData.length} paket` : ""),
      service: {
        ...updated,
        photoUrl: updated.photoUrl
          ? `${req.protocol}://${req.get("host")}/uploads/${updated.photoUrl}`
          : null,
      },
    });
  } catch (error) {
    console.error("Update service error:", error);
    if (error?.code === "P2025") {
      return res.status(404).json({ message: "Service tidak ditemukan" });
    }
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Delete service (packages auto delete karena cascade)
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    // Cek dulu apakah service exists
    const existingService = await prisma.service.findUnique({
      where: { id },
      select: { id: true, photoUrl: true }
    });

    if (!existingService) {
      return res.status(404).json({ message: "Service tidak ditemukan" });
    }

    // Hapus service (packages auto delete)
    await prisma.service.delete({ where: { id } });

    // Hapus file foto jika ada
    if (existingService.photoUrl) {
      const photoPath = path.join(__dirname, "../../uploads", existingService.photoUrl);
      try {
        await fs.unlink(photoPath);
      } catch (fileError) {
        console.warn(`Gagal menghapus file foto: ${fileError.message}`);
      }
    }

    res.status(200).json({ 
      message: "Service berhasil dihapus",
      deletedService: { id }
    });
  } catch (error) {
    console.error("Delete service error:", error);
    
    if (error?.code === "P2025") {
      return res.status(404).json({ message: "Service tidak ditemukan" });
    }
    
    if (error?.code === "P2003") {
      return res.status(400).json({ 
        message: "Tidak dapat menghapus service karena masih digunakan dalam booking" 
      });
    }

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

    try {
      await fs.access(photoPath);
    } catch {
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