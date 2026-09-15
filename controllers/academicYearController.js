const { AcademicYear, Member } = require("../models");
const { Op } = require("sequelize");

exports.list = async (_req, res, next) => {
  try {
    const years = await AcademicYear.findAll({
      order: [["start_date", "DESC"]],
    });
    res.json(years);
  } catch (err) {
    next(err);
  }
};

exports.current = async (_req, res, next) => {
  try {
    const year = await AcademicYear.findOne({ where: { is_current: true } });
    res.json(year || null);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { label, start_date, end_date, is_current } = req.body;
    if (is_current) {
      await AcademicYear.update({ is_current: false }, { where: {} });
    }
    const year = await AcademicYear.create({
      label,
      start_date,
      end_date,
      is_current: !!is_current,
    });
    res.status(201).json(year);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const year = await AcademicYear.findByPk(req.params.id);
    if (!year) return res.status(404).json({ message: "Annee introuvable." });

    const { label, start_date, end_date, is_current } = req.body;
    if (is_current) {
      await AcademicYear.update(
        { is_current: false },
        { where: { id: { [Op.ne]: year.id } } }
      );
    }

    await year.update({
      label,
      start_date,
      end_date,
      is_current: !!is_current,
    });
    res.json(year);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const year = await AcademicYear.findByPk(req.params.id);
    if (!year) return res.status(404).json({ message: "Annee introuvable." });
    await year.destroy();
    res.json({ message: "Annee supprimee." });
  } catch (err) {
    next(err);
  }
};