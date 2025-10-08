require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
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

module.exports = { login, logout, register,googleLogin, getAllUsers };
