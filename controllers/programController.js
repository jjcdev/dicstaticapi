const { ProgramItem, AcademicYear } = require("../models");
const { validateProgramItem } = require("../utils/validators");

/**
 * Tri chronologique portable MySQL + Postgres.
 *   1. start_date ASC
 *   2. start_time ASC (nulls → 00:00:00 via COALESCE)
 *   3. display_order ASC (casse les égalités)
 *   4. id ASC (dernier recours déterministe)
 */
const SORT = [
  ["start_date", "ASC"],
  [
    ProgramItem.sequelize.literal(
      "COALESCE(start_time, CAST('00:00:00' AS TIME))"
    ),
    "ASC",
  ],
  ["display_order", "ASC"],
  ["id", "ASC"],
];

const INCLUDE_YEAR = [
  { model: AcademicYear, as: "academic_year" },
];

exports.publicList = async (_req, res, next) => {
  try {
    const items = await ProgramItem.findAll({
      where: { is_public: true },
      include: INCLUDE_YEAR,
      order: SORT,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
};

exports.publicGetOne = async (req, res, next) => {
  try {
    const item = await ProgramItem.findOne({
      where: { id: req.params.id, is_public: true },
      include: INCLUDE_YEAR,
    });
    if (!item) return res.status(404).json({ message: "Élément introuvable." });
    res.json(item);
  } catch (err) {
    next(err);
  }
};

exports.adminList = async (_req, res, next) => {
  try {
    const items = await ProgramItem.findAll({
      include: INCLUDE_YEAR,
      order: SORT,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
};

exports.adminGetOne = async (req, res, next) => {
  try {
    const item = await ProgramItem.findByPk(req.params.id, {
      include: INCLUDE_YEAR,
    });
    if (!item) return res.status(404).json({ message: "Élément introuvable." });
    res.json(item);
  } catch (err) {
    next(err);
  }
};

// Vérifie l'existence de l'année académique si fournie
const ensureYearExists = async (yearId) => {
  if (yearId == null) return true;
  const year = await AcademicYear.findByPk(yearId);
  return !!year;
};

exports.create = async (req, res, next) => {
  try {
    const data = validateProgramItem(req.body);

    if (data.academic_year_id && !(await ensureYearExists(data.academic_year_id))) {
      return res.status(400).json({ message: "Année académique introuvable." });
    }

    const item = await ProgramItem.create(data);
    const full = await ProgramItem.findByPk(item.id, { include: INCLUDE_YEAR });
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const item = await ProgramItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Élément introuvable." });

    // Rejoue la validation complète sur le merge pour vérifier
    // la cohérence inter-champs (end_date >= start_date même si un seul change)
    const merged = {
      title: item.title,
      description: item.description,
      start_date: item.start_date,
      end_date: item.end_date,
      start_time: item.start_time,
      end_time: item.end_time,
      location: item.location,
      room: item.room,
      pole: item.pole,
      is_public: item.is_public,
      display_order: item.display_order,
      academic_year_id: item.academic_year_id,
      ...req.body,
    };

    const data = validateProgramItem(merged);

    if (data.academic_year_id && !(await ensureYearExists(data.academic_year_id))) {
      return res.status(400).json({ message: "Année académique introuvable." });
    }

    await item.update(data);
    const full = await ProgramItem.findByPk(item.id, { include: INCLUDE_YEAR });
    res.json(full);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const item = await ProgramItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: "Élément introuvable." });
    await item.destroy();
    res.json({ message: "Élément supprimé." });
  } catch (err) {
    next(err);
  }
};

exports.reorder = async (req, res, next) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order) || order.length === 0) {
      return res
        .status(400)
        .json({ message: "Tableau 'order' requis : [{ id, display_order }]." });
    }

    for (const entry of order) {
      const id = parseInt(entry.id, 10);
      const pos = parseInt(entry.display_order, 10);
      if (!Number.isInteger(id) || !Number.isInteger(pos) || pos < 0) continue;
      await ProgramItem.update({ display_order: pos }, { where: { id } });
    }

    const items = await ProgramItem.findAll({
      include: INCLUDE_YEAR,
      order: SORT,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
};