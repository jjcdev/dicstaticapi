const { Op } = require("sequelize");
const {
  OrientationPreference,
  Workshop,
  WorkshopStudent,
  User,
} = require("../models");
const { ROLES, ORIENTATION_STATUS, ENROLLMENT_STATUS } = require("../utils/constants");
const { sanitizeText } = require("../utils/sanitize");
const { ValidationError } = require("../utils/validators");
const AppError = require("../utils/AppError");

const INCLUDE = [
  { model: Workshop, as: "target_workshop", attributes: ["id", "title", "type", "status"] },
  { model: User, as: "student", attributes: ["id", "first_name", "last_name", "email"] },
];

/* ─────────── Création d'une préférence (étudiant) ─────────── */

exports.create = async (req, res, next) => {
  try {
    const target_workshop_id = req.body.target_workshop_id;
    if (!target_workshop_id || typeof target_workshop_id !== "string") {
      return res.status(400).json({ message: "target_workshop_id requis." });
    }

    const reason = req.body.reason
      ? sanitizeText(String(req.body.reason)).slice(0, 2000)
      : null;

    const workshop = await Workshop.findByPk(target_workshop_id);
    if (!workshop) {
      return res.status(404).json({ message: "Pôle introuvable." });
    }
    if (workshop.status !== "active") {
      return res.status(400).json({ message: "Ce pôle n'est pas actif." });
    }

    // Pas de préférence pending existante
    const existing = await OrientationPreference.findOne({
      where: {
        student_id: req.user.id,
        status: ORIENTATION_STATUS.PENDING,
      },
    });
    if (existing) {
      return res.status(409).json({
        message: "Vous avez déjà une orientation en attente. Annulez-la avant d'en créer une nouvelle.",
        orientation_id: existing.id,
      });
    }

    const pref = await OrientationPreference.create({
      student_id: req.user.id,
      target_workshop_id,
      reason,
      status: ORIENTATION_STATUS.PENDING,
    });

    const full = await OrientationPreference.findByPk(pref.id, { include: INCLUDE });
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mes préférences (étudiant) ─────────── */

exports.getMine = async (req, res, next) => {
  try {
    const preferences = await OrientationPreference.findAll({
      where: { student_id: req.user.id },
      include: [{ model: Workshop, as: "target_workshop", attributes: ["id", "title", "type"] }],
      order: [["created_at", "DESC"]],
    });
    res.json(preferences);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Annuler ma préférence ─────────── */

exports.cancelMine = async (req, res, next) => {
  try {
    const pref = await OrientationPreference.findByPk(req.params.id);
    if (!pref) {
      return res.status(404).json({ message: "Orientation introuvable." });
    }
    if (pref.student_id !== req.user.id) {
      return res.status(403).json({ message: "Ce n'est pas votre orientation." });
    }
    if (pref.status !== ORIENTATION_STATUS.PENDING) {
      return res.status(400).json({
        message: `Statut actuel : ${pref.status}. Annulation impossible.`,
      });
    }
    await pref.update({ status: ORIENTATION_STATUS.CANCELLED });
    res.json({ message: "Orientation annulée.", orientation: pref });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Liste des orientations (SG/admin/president) ─────────── */

exports.list = async (req, res, next) => {
  try {
    if (
      ![
        ROLES.ADMIN,
        ROLES.PRESIDENT,
        ROLES.SECRETAIRE_GENERALE,
      ].includes(req.user.role)
    ) {
      return res.status(403).json({ message: "Accès réservé à la direction." });
    }

    const where = {};

    if (
      typeof req.query.status === "string" &&
      Object.values(ORIENTATION_STATUS).includes(req.query.status)
    ) {
      where.status = req.query.status;
    }
    if (typeof req.query.workshop_id === "string" && req.query.workshop_id) {
      where.target_workshop_id = req.query.workshop_id;
    }
    if (typeof req.query.student_id === "string" && req.query.student_id) {
      where.student_id = req.query.student_id;
    }

    const preferences = await OrientationPreference.findAll({
      where,
      include: INCLUDE,
      order: [["created_at", "DESC"]],
      limit: 500,
    });

    res.json(preferences);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Stats agrégées (SG) ─────────── */

exports.stats = async (req, res, next) => {
  try {
    if (
      ![ROLES.ADMIN, ROLES.PRESIDENT, ROLES.SECRETAIRE_GENERALE].includes(
        req.user.role
      )
    ) {
      return res.status(403).json({ message: "Accès réservé à la direction." });
    }

    const workshops = await Workshop.findAll({
      where: { status: "active" },
      attributes: ["id", "title", "type"],
    });

    const result = [];
    for (const w of workshops) {
      const [pending, fulfilled] = await Promise.all([
        OrientationPreference.count({
          where: { target_workshop_id: w.id, status: ORIENTATION_STATUS.PENDING },
        }),
        OrientationPreference.count({
          where: { target_workshop_id: w.id, status: ORIENTATION_STATUS.FULFILLED },
        }),
      ]);
      result.push({
        workshop_id: w.id,
        workshop_title: w.title,
        workshop_type: w.type,
        pending_preferences: pending,
        fulfilled_count: fulfilled,
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};