require('dotenv').config();
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Tidak ada token, otorisasi ditolak" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Normalisasi: pastikan selalu ada user.id
    const id = decoded.id || decoded.userId || decoded.sub;
    if (!id) {
      return res.status(401).json({ message: "Token tidak memuat id user" });
    }

    req.user = {
      id,                              // <- konsisten dipakai controller
      email: decoded.email || null,
      role: decoded.role || null,
      // simpan apapun yang kamu perlukan dari payload:
      ...decoded,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token telah kedaluwarsa" });
    }
    return res.status(401).json({ message: "Token tidak valid" });
  }
};

module.exports = authMiddleware;
