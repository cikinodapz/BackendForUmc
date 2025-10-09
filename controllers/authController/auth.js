require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Password salah" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: "Login berhasil",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const logout = async (req, res) => {
  try {
    // Karena JWT stateless, logout cukup hapus token di sisi client
    res.status(200).json({ message: "Logout berhasil" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // cek apakah email sudah digunakan
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return res.status(400).json({ message: "Email sudah digunakan" });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // simpan user baru
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash: hashedPassword,
        role: "PEMINJAM", // default role
      },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    res.status(201).json({ message: "Registrasi berhasil", user: newUser });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      message: "Daftar user berhasil diambil",
      data: users,
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};


// =========================
// Google Login (ID Token)
// =========================
const googleLogin = async (req, res) => {
  try {
    const idToken = req.body.idToken || req.body.credential; // support One Tap "credential"
    if (!idToken) {
      return res.status(400).json({ message: "idToken Google wajib disertakan" });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "GOOGLE_CLIENT_ID belum dikonfigurasi" });
    }

    // Verify token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      // audience: clientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email;
    const name = payload?.name || email?.split("@")[0] || "Pengguna";
    const emailVerified = payload?.email_verified;

    if (!email) {
      return res.status(400).json({ message: "Email tidak ditemukan pada token Google" });
    }
    if (emailVerified === false) {
      return res.status(400).json({ message: "Email Google belum terverifikasi" });
    }

    // Find or create user by email
    let user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      // Create with a random password to satisfy schema
      const randomPass = Math.random().toString(36).slice(-12);
      const passwordHash = await bcrypt.hash(randomPass, 10);
      user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: "PEMINJAM",
        },
        select: { id: true, name: true, email: true, role: true, status: true },
      });
    }

    // Issue our JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      message: "Login Google berhasil",
      token,
      user,
    });
  } catch (error) {
    console.error("Google login error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Get profile of current user
const getProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User tidak terautentikasi" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        photoUrl: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    // Format absolute photo URL if available
    const formatted = {
      ...user,
      photoUrl: user.photoUrl
        ? `${req.protocol}://${req.get("host")}/uploads/${user.photoUrl}`
        : null,
    };

    return res.status(200).json({ user: formatted });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Change password for current user
const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { currentPassword, oldPassword, newPassword } = req.body || {};
    const providedCurrent = currentPassword || oldPassword;

    if (!userId) {
      return res.status(401).json({ message: "User tidak terautentikasi" });
    }
    if (!providedCurrent || !newPassword) {
      return res.status(400).json({ message: "Masukkan password lama dan password baru" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Panjang password minimal 6 karakter" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !user.passwordHash) {
      return res.status(400).json({ message: "Akun tidak memiliki password yang dapat diganti" });
    }

    const isMatch = await bcrypt.compare(providedCurrent, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Password saat ini salah" });
    }

    // Hindari password baru sama dengan password lama
    const isSame = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSame) {
      return res.status(400).json({ message: "Password baru tidak boleh sama dengan password lama" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash, updatedAt: new Date() } });

    return res.status(200).json({ message: "Password berhasil diganti" });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Update profile photo
const updateProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User tidak terautentikasi" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File foto tidak ditemukan" });
    }

    // Get previous photo to delete
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { photoUrl: true } });

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { photoUrl: req.file.filename, updatedAt: new Date() },
      select: { id: true, name: true, email: true, phone: true, photoUrl: true }
    });

    // Delete old photo file if exists and different
    try {
      if (existing?.photoUrl && existing.photoUrl !== updated.photoUrl) {
        const oldPath = path.join(__dirname, "../../uploads", existing.photoUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    } catch (e) {
      console.warn("Failed to delete old profile photo:", e.message);
    }

    return res.status(200).json({
      message: "Foto profil diperbarui",
      user: {
        ...updated,
        photoUrl: updated.photoUrl
          ? `${req.protocol}://${req.get("host")}/uploads/${updated.photoUrl}`
          : null,
      },
    });
  } catch (error) {
    console.error("Update profile photo error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

// Serve current user's profile photo file
const getProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User tidak terautentikasi" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { photoUrl: true } });
    if (!user || !user.photoUrl) {
      return res.status(404).json({ message: "Foto profil tidak ditemukan" });
    }

    const filePath = path.join(__dirname, "../../uploads", user.photoUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File foto tidak ditemukan" });
    }

    return res.sendFile(filePath);
  } catch (error) {
    console.error("Get profile photo error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

module.exports = { login, logout, register, googleLogin, getAllUsers, getProfile, changePassword, updateProfilePhoto, getProfilePhoto };
