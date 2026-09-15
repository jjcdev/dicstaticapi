const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const { Event, AcademicYear } = require("../models");

const fileToUrl = (file) => (file ? `/uploads/${file.filename}` : null);

const removeFileIfAny = (url) => {
  if (!url) return;
  const filename = url.replace(/^\/uploads\//, "");
  const full = path.join(__dirname, "..", "uploads", filename);
  if (fs.existsSync(full)) fs.unlinkSync(full);
};

exports.list = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.yearId) where.academic_year_id = req.query.yearId;
    if (req.query.upcoming === "true") {
      where.event_date = { [Op.gte]: new Date().toISOString().slice(0, 10) };
    }

    const options = {
      where,
      include: [{ model: AcademicYear, as: "academic_year" }],
      order: [["event_date", "DESC"]],
    };
    if (req.query.limit) options.limit = parseInt(req.query.limit, 10);

    const events = await Event.findAll(options);
    res.json(events);
  } catch (err) {
    next(err);
  }
};

exports.getOne = async (req, res, next) => {
  try {
    const event = await Event.findByPk(req.params.id, {
      include: [{ model: AcademicYear, as: "academic_year" }],
    });
    if (!event) return res.status(404).json({ message: "Evenement introuvable." });
    res.json(event);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (req.file) payload.cover_image = fileToUrl(req.file);
    if (!payload.academic_year_id) payload.academic_year_id = null;

    const event = await Event.create(payload);
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const event = await Event.findByPk(req.params.id);
    if (!event) return res.status(404).json({ message: "Evenement introuvable." });

    const payload = { ...req.body };
    if (req.file) {
      removeFileIfAny(event.cover_image);
      payload.cover_image = fileToUrl(req.file);
    }
    if (!payload.academic_year_id) payload.academic_year_id = null;

    await event.update(payload);
    res.json(event);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const event = await Event.findByPk(req.params.id);
    if (!event) return res.status(404).json({ message: "Evenement introuvable." });
    removeFileIfAny(event.cover_image);
    await event.destroy();
    res.json({ message: "Evenement supprime." });
  } catch (err) {
    next(err);
  }
};