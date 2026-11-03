const { Settings } = require("../models");
const { ROLES, DEFAULT_MAX_WORKSHOPS_PER_USER } = require("../utils/constants");
const AppError = require("../utils/AppError");

const ALLOWED_KEYS = ["max_workshops_per_user"];

/* ─────────── Lecture (admin) ─────────── */

// controllers/settingsController.js
exports.getAll = async (_req, res, next) => {
  try {
    const rows = await Settings.findAll();
    const result = {};
    rows.forEach((s) => {
      // Convertir les valeurs numériques en number
      const asInt = parseInt(s.value, 10);
      result[s.key] = !isNaN(asInt) && String(asInt) === s.value ? asInt : s.value;
    });
    if (!result.max_workshops_per_user) {
      result.max_workshops_per_user = DEFAULT_MAX_WORKSHOPS_PER_USER;
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Lecture publique (limite actuelle) ─────────── */

exports.getMaxWorkshops = async (_req, res, next) => {
  try {
    const s = await Settings.findOne({ where: { key: "max_workshops_per_user" } });
    const value = s ? parseInt(s.value, 10) : DEFAULT_MAX_WORKSHOPS_PER_USER;
    res.json({ max_workshops_per_user: value });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mise à jour (admin) ─────────── */

exports.update = async (req, res, next) => {
  try {
    const { key, value } = req.body || {};
    if (!key || value === undefined) {
      return res.status(400).json({ message: "Clé et valeur requises." });
    }
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({
        message: `Clé non autorisée. Autorisées : ${ALLOWED_KEYS.join(", ")}.`,
      });
    }

    let normalized;
    if (key === "max_workshops_per_user") {
      const num = parseInt(value, 10);
      if (!Number.isInteger(num) || num < 1 || num > 10) {
        return res.status(400).json({ message: "Valeur entre 1 et 10." });
      }
      normalized = String(num);
    }

    const [row] = await Settings.findOrCreate({
      where: { key },
      defaults: { value: normalized, updated_by: req.user.id },
    });
    if (row.value !== normalized) {
      await row.update({ value: normalized, updated_by: req.user.id });
    }

    res.json({ [key]: normalized });
  } catch (err) {
    next(err);
  }
};