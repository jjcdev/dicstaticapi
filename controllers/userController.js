const { User, Workshop } = require("../models");
const { ROLES, ALL_ROLES } = require("../utils/constants");
const { notifyRoleChange } = require("../utils/roleChangeNotifier");
const AppError = require("../utils/AppError");
const { Op } = require("sequelize");

/* ─────────── Liste (admin) ─────────── */

exports.getAll = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.role) {
      if (!ALL_ROLES.includes(req.query.role)) {
        return res.status(400).json({ message: "Rôle invalide." });
      }
      where.role = req.query.role;
    }
    if (typeof req.query.search === "string" && req.query.search) {
      const term = req.query.search.replace(/[%_]/g, "\\$&");
      where[Op.or] = [
        { first_name: { [Op.like]: `%${term}%` } },
        { last_name: { [Op.like]: `%${term}%` } },
        { email: { [Op.like]: `%${term}%` } },
      ];
    }
    if (req.query.include_inactive === "true") {
      // pas de scope : tous
    } else {
      where.is_active = true;
    }

    const users = await User.findAll({
      where,
      attributes: { exclude: ["password", "reset_password_token", "reset_password_expire"] },
      order: [["created_at", "DESC"]],
      limit: 200,
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Détail ─────────── */

exports.getOne = async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.ADMIN && req.user.id !== req.params.id) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    res.json(user.toSafeJSON());
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mise à jour du rôle (admin uniquement) ─────────── */

exports.updateRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ message: "Rôle invalide." });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

    const oldRole = user.role;
    if (oldRole === ROLES.ADMIN && role !== ROLES.ADMIN) {
      const adminCount = await User.count({
        where: { role: ROLES.ADMIN, is_active: true },
      });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Impossible : il doit rester au moins un admin actif.",
        });
      }
    }

    if (user.id === req.user.id && role !== ROLES.ADMIN) {
      return res.status(400).json({
        message: "Vous ne pouvez pas retirer votre propre rôle admin.",
      });
    }

    await user.update({ role, is_active: true });
    if (oldRole !== role) {
      notifyRoleChange(user.id, role, oldRole);
    }
    res.json(user.toSafeJSON());
  } catch (err) {
    next(err);
  }
};

/* ─────────── Désactivation ─────────── */

exports.deactivate = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    if (user.id === req.user.id) {
      return res.status(400).json({ message: "Vous ne pouvez pas vous désactiver." });
    }
    if (user.role === ROLES.ADMIN) {
      const adminCount = await User.count({
        where: { role: ROLES.ADMIN, is_active: true },
      });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Impossible : il doit rester au moins un admin actif.",
        });
      }
    }
    await user.update({ is_active: false });
    res.json({ message: "Utilisateur désactivé." });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Réactivation ─────────── */

exports.reactivate = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    await user.update({ is_active: true });
    res.json(user.toSafeJSON());
  } catch (err) {
    next(err);
  }
};