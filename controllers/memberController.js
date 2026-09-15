const fs = require("fs");
const path = require("path");
const { Member, AcademicYear } = require("../models");

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

    const members = await Member.findAll({
      where,
      include: [{ model: AcademicYear, as: "academic_year" }],
      order: [
        ["display_order", "ASC"],
        ["last_name", "ASC"],
      ],
    });
    res.json(members);
  } catch (err) {
    next(err);
  }
};

exports.getOne = async (req, res, next) => {
  try {
    const member = await Member.findByPk(req.params.id, {
      include: [{ model: AcademicYear, as: "academic_year" }],
    });
    if (!member) return res.status(404).json({ message: "Membre introuvable." });
    res.json(member);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (req.file) payload.photo_url = fileToUrl(req.file);
    if (payload.display_order !== undefined) {
      payload.display_order = parseInt(payload.display_order, 10) || 0;
    }
    const member = await Member.create(payload);
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const member = await Member.findByPk(req.params.id);
    if (!member) return res.status(404).json({ message: "Membre introuvable." });

    const payload = { ...req.body };
    if (req.file) {
      removeFileIfAny(member.photo_url);
      payload.photo_url = fileToUrl(req.file);
    }
    if (payload.display_order !== undefined) {
      payload.display_order = parseInt(payload.display_order, 10) || 0;
    }

    await member.update(payload);
    res.json(member);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const member = await Member.findByPk(req.params.id);
    if (!member) return res.status(404).json({ message: "Membre introuvable." });
    removeFileIfAny(member.photo_url);
    await member.destroy();
    res.json({ message: "Membre supprime." });
  } catch (err) {
    next(err);
  }
};