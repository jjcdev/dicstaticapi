const { Op } = require("sequelize");
const {
  Workshop,
  WorkshopStudent,
  User,
  AcademicYear,
  Settings,
  sequelize,
} = require("../models");
const {
  ValidationError,
  validateApplication: _unused,
  trim,
  isEmail,
  normalizeEmail,
} = require("../utils/validators");
const {
  WORKSHOP_STATUS,
  ENROLLMENT_STATUS,
  ROLES,
  DEFAULT_MAX_WORKSHOPS_PER_USER,
} = require("../utils/constants");
const { sanitizeText, sanitizeLine } = require("../utils/sanitize");
const pick = require("../utils/pick");
const AppError = require("../utils/AppError");

const WORKSHOP_FIELDS = [
  "title",
  "description",
  "objectives",
  "location",
  "instructor_id",
  "co_instructor_id",
  "status",
];

const INCLUDE_INSTRUCTORS = [
  { model: User, as: "instructor", attributes: ["id", "first_name", "last_name", "email"] },
  { model: User, as: "co_instructor", attributes: ["id", "first_name", "last_name", "email"] },
];

const isOwner = (user, workshop) =>
  user.role === ROLES.ADMIN ||
  user.id === workshop.instructor_id ||
  user.id === workshop.co_instructor_id;

const validateWorkshopPayload = (body, { partial = false } = {}) => {
  const fields = {};
  const data = {};

  if (body.title !== undefined || !partial) {
    const title = sanitizeLine(trim(body.title));
    if (!title || title.length < 3 || title.length > 200) {
      fields.title = "Titre requis (3 à 200 caractères).";
    } else {
      data.title = title;
    }
  }

  if (body.description !== undefined || !partial) {
    const description = sanitizeText(trim(body.description));
    if (!description || description.length < 10 || description.length > 5000) {
      fields.description = "Description requise (10 à 5000 caractères).";
    } else {
      data.description = description;
    }
  }

  if (body.objectives !== undefined) {
    if (body.objectives === null) {
      data.objectives = [];
    } else if (
      Array.isArray(body.objectives) &&
      body.objectives.every((o) => typeof o === "string" && o.length <= 200)
    ) {
      data.objectives = body.objectives.map((o) => sanitizeLine(o));
    } else {
      fields.objectives = "Objectifs : tableau de chaînes (max 200 car. chacune).";
    }
  }

  if (body.location !== undefined) {
    if (body.location === null || body.location === "") {
      data.location = null;
    } else {
      const location = sanitizeLine(String(body.location));
      if (location.length > 160) {
        fields.location = "Lieu trop long (max 160 caractères).";
      } else {
        data.location = location || null;
      }
    }
  }

  if (body.instructor_id !== undefined) {
    data.instructor_id = body.instructor_id || null;
  }
  if (body.co_instructor_id !== undefined) {
    data.co_instructor_id = body.co_instructor_id || null;
  }

  if (body.status !== undefined) {
    const allowed = [WORKSHOP_STATUS.ACTIVE, WORKSHOP_STATUS.COMPLETED, WORKSHOP_STATUS.CANCELLED];
    if (!allowed.includes(body.status)) {
      fields.status = `Statut invalide (${allowed.join(", ")}).`;
    } else {
      data.status = body.status;
    }
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
};

/* ─────────── Liste publique (ateliers disponibles) ─────────── */

exports.getAvailable = async (req, res, next) => {
  try {
    const workshops = await Workshop.findAll({
      where: { status: WORKSHOP_STATUS.ACTIVE },
      include: INCLUDE_INSTRUCTORS,
      order: [["created_at", "DESC"]],
    });
    res.json(workshops);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Liste admin/responsables ─────────── */

exports.getAll = async (req, res, next) => {
  try {
    const where = {};
    if (
      req.user.role === ROLES.INSTRUCTOR ||
      req.user.role === ROLES.CO_INSTRUCTOR
    ) {
      where[Op.or] = [
        { instructor_id: req.user.id },
        { co_instructor_id: req.user.id },
      ];
    }

    const workshops = await Workshop.findAll({
      where,
      include: INCLUDE_INSTRUCTORS,
      order: [["created_at", "DESC"]],
    });
    res.json(workshops);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mes ateliers (étudiant) ─────────── */

exports.getMyWorkshops = async (req, res, next) => {
  try {
    const enrollments = await WorkshopStudent.findAll({
      where: { student_id: req.user.id },
      include: [
        {
          model: Workshop,
          as: "workshop",
          include: INCLUDE_INSTRUCTORS,
        },
      ],
      order: [["created_at", "DESC"]],
    });
    res.json(enrollments);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Détail ─────────── */

exports.getOne = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id, {
      include: INCLUDE_INSTRUCTORS,
    });
    if (!workshop) {
      return res.status(404).json({ message: "Atelier introuvable." });
    }

    const isAdminOrOwner = isOwner(req.user, workshop);
    let isActiveStudent = false;
    if (!isAdminOrOwner) {
      const enrollment = await WorkshopStudent.findOne({
        where: {
          workshop_id: workshop.id,
          student_id: req.user.id,
          status: ENROLLMENT_STATUS.ACTIVE,
        },
      });
      isActiveStudent = !!enrollment;
    }

    // Détail public : pas de roster ni séances
    if (!isAdminOrOwner && !isActiveStudent) {
      return res.json(workshop);
    }

    // Détail complet : roster actif + séances
    const [students, sessions] = await Promise.all([
      User.findAll({
        attributes: ["id", "first_name", "last_name", "email"],
        include: [
          {
            model: WorkshopStudent,
            as: "enrollments",
            where: { workshop_id: workshop.id, status: ENROLLMENT_STATUS.ACTIVE },
            required: true,
            attributes: ["joined_at", "promotion"],
          },
        ],
      }),
      workshop.getSessions
        ? workshop.getSessions({
            attributes: ["id", "title", "date", "session_number", "description"],
            order: [["date", "ASC"]],
          })
        : Promise.resolve([]),
    ]);

    res.json({ ...workshop.toJSON(), students, sessions });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Création (admin / président) ─────────── */

exports.create = async (req, res, next) => {
  try {
    const data = validateWorkshopPayload(req.body);

    // Le co-instructor ne peut pas être le même que l'instructor
    if (
      data.instructor_id &&
      data.co_instructor_id &&
      data.instructor_id === data.co_instructor_id
    ) {
      data.co_instructor_id = null;
    }

    // Vérifier l'existence des utilisateurs
    for (const field of ["instructor_id", "co_instructor_id"]) {
      if (data[field]) {
        const u = await User.findByPk(data[field]);
        if (!u) {
          return res.status(400).json({
            message: `Utilisateur '${field}' introuvable.`,
          });
        }
      }
    }

    const workshop = await Workshop.create({
      ...data,
      status: data.status || WORKSHOP_STATUS.ACTIVE,
    });

    const created = await Workshop.findByPk(workshop.id, {
      include: INCLUDE_INSTRUCTORS,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mise à jour ─────────── */

exports.update = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) {
      return res.status(404).json({ message: "Atelier introuvable." });
    }
    if (!isOwner(req.user, workshop)) {
      return res.status(403).json({ message: "Vous n'êtes pas responsable de cet atelier." });
    }

    const payload = pick(req.body, WORKSHOP_FIELDS);
    const data = validateWorkshopPayload(payload, { partial: true });

    // Vérif conflit instructor / co-instructor
    const newInstructor =
      data.instructor_id !== undefined ? data.instructor_id : workshop.instructor_id;
    const newCoInstructor =
      data.co_instructor_id !== undefined ? data.co_instructor_id : workshop.co_instructor_id;
    if (newInstructor && newCoInstructor && newInstructor === newCoInstructor) {
      data.co_instructor_id = null;
    }

    for (const field of ["instructor_id", "co_instructor_id"]) {
      if (data[field]) {
        const u = await User.findByPk(data[field]);
        if (!u) {
          return res.status(400).json({
            message: `Utilisateur '${field}' introuvable.`,
          });
        }
      }
    }

    await workshop.update(data);
    const updated = await Workshop.findByPk(workshop.id, {
      include: INCLUDE_INSTRUCTORS,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Suppression (soft delete) ─────────── */

exports.remove = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) {
      return res.status(404).json({ message: "Atelier introuvable." });
    }
    if (!isOwner(req.user, workshop)) {
      return res.status(403).json({ message: "Vous n'êtes pas responsable de cet atelier." });
    }
    await workshop.destroy();
    res.json({ message: "Atelier supprimé." });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Demande d'inscription (étudiant) ─────────── */

exports.joinRequest = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) {
      return res.status(404).json({ message: "Atelier introuvable." });
    }
    if (workshop.status !== WORKSHOP_STATUS.ACTIVE) {
      return res.status(400).json({ message: "Cet atelier n'est pas disponible." });
    }

    // Limite max d'ateliers actifs
    const setting = await Settings.findOne({ where: { key: "max_workshops_per_user" } });
    const maxWorkshops = setting
      ? parseInt(setting.value, 10)
      : DEFAULT_MAX_WORKSHOPS_PER_USER;

    const activeCount = await WorkshopStudent.count({
      where: {
        student_id: req.user.id,
        status: { [Op.in]: [ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.ACTIVE] },
      },
    });
    if (activeCount >= maxWorkshops) {
      return res.status(400).json({
        message: `Vous êtes déjà inscrit à ${activeCount} atelier(s). Limite : ${maxWorkshops}.`,
      });
    }

    const existing = await WorkshopStudent.findOne({
      where: { workshop_id: workshop.id, student_id: req.user.id },
    });
    if (existing) {
      if (existing.status === ENROLLMENT_STATUS.DROPPED) {
        existing.status = ENROLLMENT_STATUS.PENDING;
        existing.dropped_at = null;
        existing.joined_at = null;
        await existing.save();
        return res.json({
          message: "Votre demande a été renvoyée.",
          enrollment: existing,
        });
      }
      return res.status(409).json({
        message: "Vous êtes déjà inscrit à cet atelier.",
      });
    }

    const year = await AcademicYear.findOne({ where: { is_current: true } });
    const enrollment = await WorkshopStudent.create({
      workshop_id: workshop.id,
      student_id: req.user.id,
      status: ENROLLMENT_STATUS.PENDING,
      academic_year_id: year ? year.id : null,
      promotion: null,
    });

    res.status(201).json({
      message: "Demande envoyée. En attente de validation.",
      enrollment,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Quitter un atelier ─────────── */

exports.leaveWorkshop = async (req, res, next) => {
  try {
    const enrollment = await WorkshopStudent.findOne({
      where: { workshop_id: req.params.id, student_id: req.user.id },
    });
    if (!enrollment) {
      return res.status(404).json({ message: "Inscription introuvable." });
    }
    if (enrollment.status === ENROLLMENT_STATUS.DROPPED) {
      return res.status(400).json({ message: "Vous avez déjà quitté cet atelier." });
    }
    enrollment.status = ENROLLMENT_STATUS.DROPPED;
    enrollment.dropped_at = new Date();
    await enrollment.save();
    res.json({ message: "Vous avez quitté l'atelier." });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Gérer une inscription (responsable) ─────────── */

exports.manageEnrollment = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) {
      return res.status(404).json({ message: "Atelier introuvable." });
    }
    if (!isOwner(req.user, workshop)) {
      return res.status(403).json({ message: "Vous n'êtes pas responsable de cet atelier." });
    }

    const { user_id, status } = req.body;
    if (!["active", "dropped"].includes(status)) {
      return res.status(400).json({ message: "Statut invalide (active|dropped)." });
    }
    if (!user_id) {
      return res.status(400).json({ message: "user_id requis." });
    }

    const enrollment = await WorkshopStudent.findOne({
      where: { workshop_id: workshop.id, student_id: user_id },
    });
    if (!enrollment) {
      return res.status(404).json({ message: "Inscription introuvable." });
    }

    enrollment.status =
      status === "active" ? ENROLLMENT_STATUS.ACTIVE : ENROLLMENT_STATUS.DROPPED;
    if (status === "active") {
      enrollment.joined_at = new Date();
      if (!enrollment.academic_year_id) {
        const year = await AcademicYear.findOne({ where: { is_current: true } });
        if (year) enrollment.academic_year_id = year.id;
      }
    } else {
      enrollment.dropped_at = new Date();
    }
    await enrollment.save();

    res.json(enrollment);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Demandes en attente (responsable) ─────────── */

exports.getRequests = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) {
      return res.status(404).json({ message: "Atelier introuvable." });
    }
    if (!isOwner(req.user, workshop)) {
      return res.status(403).json({ message: "Vous n'êtes pas responsable de cet atelier." });
    }

    const requests = await WorkshopStudent.findAll({
      where: { workshop_id: workshop.id, status: ENROLLMENT_STATUS.PENDING },
      include: [
        {
          model: User,
          as: "student",
          attributes: ["id", "first_name", "last_name", "email"],
        },
      ],
      order: [["created_at", "ASC"]],
    });
    res.json(requests);
  } catch (err) {
    next(err);
  }
};