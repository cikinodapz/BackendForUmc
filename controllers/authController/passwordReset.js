require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();
const { sendMail } = require("../../services/mailer");

function generateOTP(length = 6) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

// POST /auth/password/forgot { email }
async function forgotPassword(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: "Email wajib diisi" });

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, status: true } });
    // Untuk keamanan, selalu balas OK meskipun email tidak ada
    if (!user) {
      return res.status(200).json({ message: "Jika email terdaftar, OTP telah dikirim" });
    }

    // Buat OTP dan simpan hashed
    const otp = generateOTP(6);
    const otpHash = await bcrypt.hash(otp, 10);
    const ttlMinutes = Number(process.env.RESET_OTP_TTL_MIN || 10);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    // Optional: invalidate previous pending OTP for this email (soft way: mark usedAt)
    await prisma.passwordReset.updateMany({
      where: { email, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        email,
        otpHash,
        expiresAt,
      },
    });

    const appName = process.env.APP_NAME || 'UMC Media Hub';
    const subject = `${appName} - Kode Reset Password`;
    const html = `
      <div style="font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
        <h2 style="margin:0 0 8px 0">Reset Password</h2>
        <p>Halo ${user.name || 'Pengguna'},</p>
        <p>Gunakan kode berikut untuk mengatur ulang password Anda. Kode berlaku ${ttlMinutes} menit.</p>
        <div style="margin:16px 0;padding:12px;border:1px dashed #4f46e5;border-radius:10px;display:inline-block">
          <div style="font-size:28px;letter-spacing:6px;font-weight:700;color:#1e293b">${otp}</div>
        </div>
        <p>Abaikan email ini jika Anda tidak meminta reset password.</p>
      </div>`;
    const text = `Halo ${user.name || 'Pengguna'},\nKode reset password Anda: ${otp}\nBerlaku ${ttlMinutes} menit.`;
    await sendMail({ to: email, subject, text, html });

    return res.status(200).json({ message: "Jika email terdaftar, OTP telah dikirim" });
  } catch (error) {
    console.error("forgotPassword error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
}

// POST /auth/password/reset { email, otp, newPassword }
async function resetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, dan password baru wajib diisi" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Panjang password minimal 6 karakter" });
    }

    const record = await prisma.passwordReset.findFirst({
      where: { email, usedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, otpHash: true, expiresAt: true, userId: true, attempts: true },
    });

    // Hindari user enumeration: tetap gunakan pesan umum untuk kegagalan
    if (!record) {
      return res.status(400).json({ message: "OTP tidak valid atau telah kedaluwarsa" });
    }
    if (record.expiresAt <= new Date()) {
      return res.status(400).json({ message: "OTP telah kedaluwarsa" });
    }

    // Batasi percobaan
    const MAX_ATTEMPTS = Number(process.env.RESET_OTP_MAX_ATTEMPTS || 5);
    if (record.attempts >= MAX_ATTEMPTS) {
      // Mark used to prevent further attempts
      await prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      return res.status(400).json({ message: "Terlalu banyak percobaan, minta OTP baru" });
    }

    const match = await bcrypt.compare(String(otp), record.otpHash);
    if (!match) {
      await prisma.passwordReset.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      return res.status(400).json({ message: "OTP salah" });
    }

    // Update password user
    const newHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash: newHash, updatedAt: new Date() } }),
      prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return res.status(200).json({ message: "Password berhasil diperbarui" });
  } catch (error) {
    console.error("resetPassword error:", error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
}

module.exports = { forgotPassword, resetPassword };

