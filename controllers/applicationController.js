const { Op } = require("sequelize");
const { Application, AcademicYear } = require("../models");
const { validateApplication, isValidDate, normalizePole } = require("../utils/validators");

exports.create = async (req, res, next) => {
  try {
    const data = validateApplication(req.body);

    const existing = await Application.findOne({ where: { email: data.email } });
    if (existing) {
      return res.status(409).json({
        message:
          "Cette adresse email a déjà une candidature enregistrée. Le club vous recontactera.",
      });
    }

    const application = await Application.create(data);

    console.log("[application] nouvelle candidature", {
      id: application.id,
      pole: application.pole,
      ip: req.ip,
      at: application.created_at,
    });

    res.status(201).json({ message: "Candidature enregistrée." });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const where = {};

    // pole — string strict + normalisation
    if (typeof req.query.pole === "string" && req.query.pole) {
      const pole = normalizePole(req.query.pole);
      if (!pole) {
        return res.status(400).json({ message: "Pôle invalide." });
      }
      where.pole = pole;
    }

    // email — string strict
    if (typeof req.query.email === "string" && req.query.email) {
      where.email = req.query.email.trim().toLowerCase();
    }

    // yearId — entier strict
    if (typeof req.query.yearId === "string" && req.query.yearId) {
      const yearId = parseInt(req.query.yearId, 10);
      if (!Number.isInteger(yearId) || yearId < 1) {
        return res.status(400).json({ message: "Identifiant d'année invalide." });
      }
      const year = await AcademicYear.findByPk(yearId);
      if (!year) {
        return res.status(404).json({ message: "Année académique introuvable." });
      }
      where.created_at = {
        [Op.gte]: year.start_date,
        [Op.lte]: `${year.end_date} 23:59:59`,
      };
    }

    // from/to — format YYYY-MM-DD strict
    if (typeof req.query.from === "string" && req.query.from) {
      if (!isValidDate(req.query.from)) {
        return res.status(400).json({ message: "Paramètre 'from' invalide." });
      }
      where.created_at = where.created_at || {};
      where.created_at[Op.gte] = req.query.from;
    }
    if (typeof req.query.to === "string" && req.query.to) {
      if (!isValidDate(req.query.to)) {
        return res.status(400).json({ message: "Paramètre 'to' invalide." });
      }
      where.created_at = where.created_at || {};
      where.created_at[Op.lte] = `${req.query.to} 23:59:59`;
    }

    const options = {
      where,
      order: [["created_at", "DESC"]],
      limit: 200,
    };
    if (typeof req.query.limit === "string") {
      const l = parseInt(req.query.limit, 10);
      if (Number.isInteger(l) && l > 0) options.limit = Math.min(l, 200);
    }
    if (typeof req.query.offset === "string") {
      const o = parseInt(req.query.offset, 10);
      if (Number.isInteger(o) && o >= 0) options.offset = o;
    }

    const applications = await Application.findAll(options);
    res.json(applications);
  } catch (err) {
    next(err);
  }
};

exports.getOne = async (req, res, next) => {
  try {
    const application = await Application.findByPk(req.params.id);
    if (!application) {
      return res.status(404).json({ message: "Candidature introuvable." });
    }
    res.json(application);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const application = await Application.findByPk(req.params.id);
    if (!application) {
      return res.status(404).json({ message: "Candidature introuvable." });
    }
    await application.destroy();
    res.json({ message: "Candidature supprimée." });
  } catch (err) {
    next(err);
  }
};