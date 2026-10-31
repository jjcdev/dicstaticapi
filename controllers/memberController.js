const { Member, AcademicYear } = require("../models");
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../middlewares/upload");
const pick = require("../utils/pick");

const ALLOWED_FIELDS = [
  "first_name",
  "last_name",
  "role",
  "bio",
  "linkedin",
  "github",
  "display_order",
  "academic_year_id",
];

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
    const payload = pick(req.body, ALLOWED_FIELDS);
    if (req.file) {
      payload.photo_url = await uploadToCloudinary(req.file, "dic/members");
    }
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

    const payload = pick(req.body, ALLOWED_FIELDS);
    if (req.file) {
      await deleteFromCloudinary(member.photo_url);
      payload.photo_url = await uploadToCloudinary(req.file, "dic/members");
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
    await deleteFromCloudinary(member.photo_url);
    await member.destroy();
    res.json({ message: "Membre supprime." });
  } catch (err) {
    next(err);
  }
};