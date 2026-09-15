const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Admin } = require("../models");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const toSafe = (admin) => ({
  id: admin.id,
  username: admin.username,
  email: admin.email,
  role: admin.role,
});

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email et mot de passe requis." });
    }

    const admin = await Admin.findOne({ where: { email } });
    if (!admin) {
      return res.status(401).json({ message: "Identifiants invalides." });
    }

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) {
      return res.status(401).json({ message: "Identifiants invalides." });
    }

    res.json({ token: signToken(admin.id), admin: toSafe(admin) });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res) => {
  res.json({ admin: toSafe(req.admin) });
};