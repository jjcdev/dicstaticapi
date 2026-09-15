const jwt = require("jsonwebtoken");
const { Admin } = require("../models");

exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token manquant." });
    }

    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findByPk(decoded.id, {
      attributes: { exclude: ["password"] },
    });

    if (!admin) return res.status(401).json({ message: "Compte introuvable." });

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalide ou expire." });
  }
};