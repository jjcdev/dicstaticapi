const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { ROLES } = require("../utils/constants");
const { normalizeEmail, isEmail } = require("../utils/validators");
const {
  getPendingRoleChange,
  clearPendingRoleChange,
} = require("../utils/roleChangeNotifier");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

/**
 * Sérialisation "self" — inclut les champs QR + `qr_needs_refresh`.
 * Utilisé par login, me, updateProfile.
 */
const safeUser = (user) => user.toSelfJSON();

const withAdminAlias = (user) => {
  const payload = { user: safeUser(user) };
  if (user.role === ROLES.ADMIN) {
    payload.admin = {
      id: user.id,
      username: user.first_name,
      email: user.email,
      role: ROLES.ADMIN,
    };
  }
  return payload;
};

/* ─────────── Register ─────────── */

exports.register = async (req, res, next) => {
  try {
    const first_name = String(req.body.first_name || "").trim();
    const last_name = String(req.body.last_name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    const phone = req.body.phone ? String(req.body.phone).trim() : null;
    const sexe = req.body.sexe === "homme" || req.body.sexe === "femme"
      ? req.body.sexe
      : null;

    const errors = {};
    if (!first_name || first_name.length < 2) {
      errors.first_name = "Prénom requis (2 caractères min).";
    }
    if (!last_name || last_name.length < 2) {
      errors.last_name = "Nom requis (2 caractères min).";
    }
    if (!isEmail(email)) {
      errors.email = "Email invalide.";
    }
    if (!password || password.length < 8) {
      errors.password = "Mot de passe requis (8 caractères min).";
    }
    if (Object.keys(errors).length) {
      return res.status(400).json({ message: "Validation échouée.", errors });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "Cet email est déjà utilisé." });
    }

    const user = await User.create({
      first_name,
      last_name,
      email,
      phone,
      sexe,
      password,
      role: ROLES.STUDENT,
    });

    return res.status(201).json({
      token: signToken(user.id),
      ...withAdminAlias(user),
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Login ─────────── */

exports.login = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ message: "Email et mot de passe requis." });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ message: "Identifiants invalides." });

    if (!user.is_active) {
      return res.status(401).json({
        message: "Compte désactivé. Contactez l'administration.",
      });
    }

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Identifiants invalides." });

    await user.update({ last_login: new Date() });

    return res.json({
      token: signToken(user.id),
      ...withAdminAlias(user),
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Me ─────────── */

exports.me = async (req, res) => {
  res.json(withAdminAlias(req.user));
};

/* ─────────── Update profile ─────────── */

exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ["first_name", "last_name", "phone", "bio", "department", "level"];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "Compte introuvable." });

    await user.update(updates);
    res.json(withAdminAlias(user));
  } catch (err) {
    next(err);
  }
};

/* ─────────── Change password ─────────── */

exports.changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ message: "Ancien et nouveau mot de passe requis." });
    }
    if (new_password.length < 8) {
      return res.status(400).json({
        message: "Nouveau mot de passe trop court (8 caractères min).",
      });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "Compte introuvable." });

    const ok = await user.comparePassword(current_password);
    if (!ok) return res.status(401).json({ message: "Mot de passe actuel incorrect." });

    await user.update({ password: new_password });
    res.json({ message: "Mot de passe modifié." });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Check role change ─────────── */

exports.checkRoleChange = async (req, res, next) => {
  try {
    const pending = getPendingRoleChange(req.user.id);
    if (!pending) {
      return res.json({ hasRoleChange: false });
    }
    clearPendingRoleChange(req.user.id);

    const fresh = await User.findByPk(req.user.id);

    res.json({
      hasRoleChange: true,
      old_role: pending.oldRole,
      new_role: pending.newRole,
      user: fresh ? safeUser(fresh) : null,
    });
  } catch (err) {
    next(err);
  }
};