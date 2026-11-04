const { Op } = require("sequelize");
const {
  Workshop,
  WorkshopStudent,
  User,
  AcademicYear,
  Settings,
} = require("../models");
const {
  ValidationError,
  trim,
  isValidDate,
} = require("../utils/validators");
const {
  WORKSHOP_STATUS,
  ENROLLMENT_STATUS,
  ROLES,
  SUPERUSER_ROLES,
  DEFAULT_MAX_WORKSHOPS_PER_USER,
} = require("../utils/constants");
const { sanitizeText, sanitizeLine } = require("../utils/sanitize");
const pick = require("../utils/pick");
const AppError = require("../utils/AppError");
const {
  isWorkshopOwnerOnly,
  isWorkshopManager,
} = require("../middlewares/rbac");
const { push, NOTIF_TYPES } = require("../utils/notifications");

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

const validateWorkshopPayload = (body, { partial = false } = {}) => {
  const fields = {};
  const data = {};

  if (body.title !== undefined || !partial) {
    const title = sanitizeLine(trim(body.title));
    if (!title || title.length < 3 || title.length > 200) {
      fields.title = "Titre requis (3 à 200 caractères).";
    } else data.title = title;
  }

  if (body.description !== undefined || !partial) {
    const description = sanitizeText(trim(body.description));
    if (!description || description.length < 10 || description.length > 5000) {
      fields.description = "Description requise (10 à 5000 caractères).";
    } else data.description = description;
  }

  if (body.objectives !== undefined) {
    if (body.objectives === null) data.objectives = [];
    else if (
      Array.isArray(body.objectives) &&
      body.objectives.every((o) => typeof o === "string" && o.length <= 200)
    ) {
      data.objectives = body.objectives.map((o) => sanitizeLine(o));
    } else {
      fields.objectives = "Objectifs : tableau de chaînes (max 200 car.).";
    }
  }

  if (body.location !== undefined) {
    if (body.location === null || body.location === "") data.location = null;
    else {
      const location = sanitizeLine(String(body.location));
      if (location.length > 160) fields.location = "Lieu trop long (max 160).";
      else data.location = location || null;
    }
  }

  if (body.instructor_id !== undefined) data.instructor_id = body.instructor_id || null;
  if (body.co_instructor_id !== undefined) data.co_instructor_id = body.co_instructor_id || null;

  if (body.status !== undefined) {
    const allowed = [WORKSHOP_STATUS.ACTIVE, WORKSHOP_STATUS.COMPLETED, WORKSHOP_STATUS.CANCELLED];
    if (!allowed.includes(body.status)) fields.status = `Statut invalide (${allowed.join(", ")}).`;
    else data.status = body.status;
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
};

const isSuperuserRole = (user) => SUPERUSER_ROLES.includes(user.role);

/* ─────────── Lecture publique ─────────── */

exports.getAvailable = async (_req, res, next) => {
  try {
    const workshops = await Workshop.findAll({
      where: { status: WORKSHOP_STATUS.ACTIVE },
      include: INCLUDE_INSTRUCTORS,
      order: [["created_at", "DESC"]],
    });
    res.json(workshops);
  } catch (err) { next(err); }
};

/* ─────────── Lecture selon rôle ─────────── */

exports.getAll = async (req, res, next) => {
  try {
    const where = {};
    if (!isSuperuserRole(req.user)) {
      if ([ROLES.INSTRUCTOR, ROLES.CO_INSTRUCTOR].includes(req.user.role)) {
        where[Op.or] = [
          { instructor_id: req.user.id },
          { co_instructor_id: req.user.id },
        ];
      }
    }

    const workshops = await Workshop.findAll({
      where,
      include: INCLUDE_INSTRUCTORS,
      order: [["created_at", "DESC"]],
    });
    res.json(workshops);
  } catch (err) { next(err); }
};

exports.getMyWorkshops = async (req, res, next) => {
  try {
    const enrollments = await WorkshopStudent.findAll({
      where: { student_id: req.user.id },
      include: [{ model: Workshop, as: "workshop", include: INCLUDE_INSTRUCTORS }],
      order: [["created_at", "DESC"]],
    });
    res.json(enrollments);
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id, { include: INCLUDE_INSTRUCTORS });
    if (!workshop) return res.status(404).json({ message: "Atelier introuvable." });

    const isManager = isWorkshopManager(req.user, workshop);
    let isActiveStudent = false;
    if (!isSuperuserRole(req.user) && !isManager) {
      const enrollment = await WorkshopStudent.findOne({
        where: { workshop_id: workshop.id, student_id: req.user.id, status: ENROLLMENT_STATUS.ACTIVE },
      });
      isActiveStudent = !!enrollment;
    }

    if (!isSuperuserRole(req.user) && !isManager && !isActiveStudent) {
      return res.json(workshop);
    }

    const [students, sessions] = await Promise.all([
      User.findAll({
        attributes: ["id", "first_name", "last_name", "email"],
        include: [{
          model: WorkshopStudent,
          as: "enrollments",
          where: { workshop_id: workshop.id, status: ENROLLMENT_STATUS.ACTIVE },
          required: true,
          attributes: ["joined_at", "promotion"],
        }],
      }),
      workshop.getSessions
        ? workshop.getSessions({ attributes: ["id", "title", "date", "session_number"], order: [["date", "ASC"]] })
        : Promise.resolve([]),
    ]);

    res.json({ ...workshop.toJSON(), students, sessions });
  } catch (err) { next(err); }
};

/* ─────────── Création / modification / suppression ─────────── */

exports.create = async (req, res, next) => {
  try {
    // admin / president / vice_president
    if (!isSuperuserRole(req.user)) {
      return res.status(403).json({ message: "Réservé à la direction." });
    }

    const data = validateWorkshopPayload(req.body);
    if (data.instructor_id && data.co_instructor_id && data.instructor_id === data.co_instructor_id) {
      data.co_instructor_id = null;
    }

    for (const field of ["instructor_id", "co_instructor_id"]) {
      if (data[field]) {
        const u = await User.findByPk(data[field]);
        if (!u) return res.status(400).json({ message: `Utilisateur '${field}' introuvable.` });
      }
    }

    const workshop = await Workshop.create({
      ...data,
      status: data.status || WORKSHOP_STATUS.ACTIVE,
    });

    const created = await Workshop.findByPk(workshop.id, { include: INCLUDE_INSTRUCTORS });
    res.status(201).json(created);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) return res.status(404).json({ message: "Atelier introuvable." });

    // admin/president/VP peuvent tout, chef/adjoint du pôle peuvent modifier (sauf affectation chef)
    const isSuper = isSuperuserRole(req.user);
    const isManager = isWorkshopManager(req.user, workshop);
    if (!isSuper && !isManager) {
      return res.status(403).json({ message: "Vous n'êtes pas responsable de cet atelier." });
    }

    const payload = pick(req.body, WORKSHOP_FIELDS);
    const data = validateWorkshopPayload(payload, { partial: true });

    // Seuls les superusers peuvent affecter/retirer chef/adjoint
    if (!isSuper) {
      delete data.instructor_id;
      delete data.co_instructor_id;
    }

    const newInstructor = data.instructor_id !== undefined ? data.instructor_id : workshop.instructor_id;
    const newCoInstructor = data.co_instructor_id !== undefined ? data.co_instructor_id : workshop.co_instructor_id;
    if (newInstructor && newCoInstructor && newInstructor === newCoInstructor) {
      data.co_instructor_id = null;
    }

    for (const field of ["instructor_id", "co_instructor_id"]) {
      if (data[field]) {
        const u = await User.findByPk(data[field]);
        if (!u) return res.status(400).json({ message: `Utilisateur '${field}' introuvable.` });
      }
    }

    await workshop.update(data);
    const updated = await Workshop.findByPk(workshop.id, { include: INCLUDE_INSTRUCTORS });
    res.json(updated);
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) return res.status(404).json({ message: "Atelier introuvable." });

    if (!isSuperuserRole(req.user) && !isWorkshopManager(req.user, workshop)) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    await workshop.destroy();
    res.json({ message: "Atelier supprimé." });
  } catch (err) { next(err); }
};

/* ─────────── Inscriptions ─────────── */

exports.joinRequest = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) return res.status(404).json({ message: "Atelier introuvable." });
    if (workshop.status !== WORKSHOP_STATUS.ACTIVE) {
      return res.status(400).json({ message: "Cet atelier n'est pas disponible." });
    }

    // Bloquer si chef/adjoint de ce pôle
    if (isWorkshopManager(req.user, workshop)) {
      return res.status(400).json({ message: "Vous êtes responsable de ce pôle — vous ne pouvez pas vous y inscrire comme étudiant." });
    }

    // Limite max d'ateliers (config)
    const setting = await Settings.findOne({ where: { key: "max_workshops_per_user" } });
    const maxWorkshops = setting ? parseInt(setting.value, 10) : DEFAULT_MAX_WORKSHOPS_PER_USER;

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

    // One-active-at-a-time : refuser si déjà active dans un autre pôle
    const activeElsewhere = await WorkshopStudent.findOne({
      where: {
        student_id: req.user.id,
        status: ENROLLMENT_STATUS.ACTIVE,
        workshop_id: { [Op.ne]: workshop.id },
      },
    });
    if (activeElsewhere) {
      return res.status(409).json({
        message: "Vous êtes déjà actif dans un autre pôle. Utilisez un transfert pour changer.",
      });
    }

    const existing = await WorkshopStudent.findOne({
      where: { workshop_id: workshop.id, student_id: req.user.id },
    });
    if (existing) {
      if (existing.status === ENROLLMENT_STATUS.DROPPED || existing.status === ENROLLMENT_STATUS.REJECTED) {
        existing.status = ENROLLMENT_STATUS.PENDING;
        existing.dropped_at = null;
        existing.rejected_at = null;
        existing.rejected_by = null;
        existing.rejection_reason = null;
        await existing.save();
        return res.json({ message: "Votre demande a été renvoyée.", enrollment: existing });
      }
      return res.status(409).json({ message: "Vous êtes déjà inscrit à cet atelier." });
    }

    const year = await AcademicYear.findOne({ where: { is_current: true } });
    const enrollment = await WorkshopStudent.create({
      workshop_id: workshop.id,
      student_id: req.user.id,
      status: ENROLLMENT_STATUS.PENDING,
      academic_year_id: year ? year.id : null,
    });

    // Notifier le chef
    if (workshop.instructor_id) {
      push(workshop.instructor_id, NOTIF_TYPES.ENROLLMENT_REQUESTED, {
        workshop_id: workshop.id,
        workshop_title: workshop.title,
        student_name: `${req.user.first_name} ${req.user.last_name}`,
        enrollment_id: enrollment.id,
      });
    }

    res.status(201).json({ message: "Demande envoyée. En attente de validation.", enrollment });
  } catch (err) { next(err); }
};

exports.leaveWorkshop = async (req, res, next) => {
  try {
    const enrollment = await WorkshopStudent.findOne({
      where: { workshop_id: req.params.id, student_id: req.user.id },
    });
    if (!enrollment) return res.status(404).json({ message: "Inscription introuvable." });
    if (enrollment.status === ENROLLMENT_STATUS.DROPPED) {
      return res.status(400).json({ message: "Vous avez déjà quitté cet atelier." });
    }
    enrollment.status = ENROLLMENT_STATUS.DROPPED;
    enrollment.dropped_at = new Date();
    await enrollment.save();
    res.json({ message: "Vous avez quitté l'atelier." });
  } catch (err) { next(err); }
};

/* ─────────── Gestion demandes (chef SEUL) ─────────── */

exports.getRequests = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) return res.status(404).json({ message: "Atelier introuvable." });

    // CHEF SEUL (pas adjoint)
    if (!isSuperuserRole(req.user) && !isWorkshopOwnerOnly(req.user, workshop)) {
      return res.status(403).json({ message: "Seul le chef du pôle peut voir les demandes." });
    }

    const requests = await WorkshopStudent.findAll({
      where: { workshop_id: workshop.id, status: ENROLLMENT_STATUS.PENDING },
      include: [{ model: User, as: "student", attributes: ["id", "first_name", "last_name", "email", "sexe"] }],
      order: [["created_at", "ASC"]],
    });
    res.json(requests);
  } catch (err) { next(err); }
};

exports.manageEnrollment = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.id);
    if (!workshop) return res.status(404).json({ message: "Atelier introuvable." });

    // CHEF SEUL (pas adjoint)
    if (!isSuperuserRole(req.user) && !isWorkshopOwnerOnly(req.user, workshop)) {
      return res.status(403).json({ message: "Seul le chef du pôle peut décider." });
    }

    const { user_id, action, status, reason } = req.body;

    // Support legacy : status "active" | "dropped"
    let finalAction = action;
    if (!finalAction && status) {
      finalAction = status === "active" ? "accept" : "reject";
    }
    if (!["accept", "reject"].includes(finalAction)) {
      return res.status(400).json({ message: "Action invalide (accept | reject)." });
    }
    if (!user_id) return res.status(400).json({ message: "user_id requis." });

    const enrollment = await WorkshopStudent.findOne({
      where: { workshop_id: workshop.id, student_id: user_id },
    });
    if (!enrollment) return res.status(404).json({ message: "Inscription introuvable." });

    if (finalAction === "accept") {
      // One-active check
      const activeElsewhere = await WorkshopStudent.findOne({
        where: {
          student_id: user_id,
          status: ENROLLMENT_STATUS.ACTIVE,
          workshop_id: { [Op.ne]: workshop.id },
        },
      });
      if (activeElsewhere) {
        return res.status(409).json({
          message: "Cet étudiant est déjà actif dans un autre pôle.",
        });
      }
      enrollment.status = ENROLLMENT_STATUS.ACTIVE;
      enrollment.joined_at = new Date();
      if (!enrollment.academic_year_id) {
        const year = await AcademicYear.findOne({ where: { is_current: true } });
        if (year) enrollment.academic_year_id = year.id;
      }
      await enrollment.save();

      push(user_id, NOTIF_TYPES.ENROLLMENT_ACCEPTED, {
        workshop_id: workshop.id,
        workshop_title: workshop.title,
      });
    } else {
      enrollment.status = ENROLLMENT_STATUS.REJECTED;
      enrollment.rejected_at = new Date();
      enrollment.rejected_by = req.user.id;
      enrollment.rejection_reason = reason ? sanitizeText(String(reason)).slice(0, 1000) : null;
      await enrollment.save();

      push(user_id, NOTIF_TYPES.ENROLLMENT_REJECTED, {
        workshop_id: workshop.id,
        workshop_title: workshop.title,
        reason: enrollment.rejection_reason,
      });
    }

    res.json(enrollment);
  } catch (err) { next(err); }
};

/* ─────────── Retrait d'un membre (Bloc C — logique ici) ─────────── */

exports.removeMember = async (req, res, next) => {
  try {
    const { id: workshopId, userId } = req.params;
    const workshop = await Workshop.findByPk(workshopId);
    if (!workshop) return res.status(404).json({ message: "Atelier introuvable." });

    const role = req.user.role;
    const isSuper = isSuperuserRole(req.user);
    const isCoord = role === ROLES.COORDINATEUR_GENERAL;
    const isOwner = isWorkshopOwnerOnly(req.user, workshop);

    if (!isSuper && !isCoord && !isOwner) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const enrollment = await WorkshopStudent.findOne({
      where: { workshop_id: workshopId, student_id: userId },
    });
    if (!enrollment) return res.status(404).json({ message: "Inscription introuvable." });

    const reason = req.body?.reason ? sanitizeText(String(req.body.reason)).slice(0, 1000) : null;

    enrollment.status = ENROLLMENT_STATUS.DROPPED;
    enrollment.dropped_at = new Date();
    enrollment.rejection_reason = reason;
    await enrollment.save();

    push(userId, NOTIF_TYPES.MEMBER_REMOVED, {
      workshop_id: workshopId,
      workshop_title: workshop.title,
      reason,
      removed_by_role: role,
    });

    res.json({ message: "Membre retiré du pôle.", enrollment });
  } catch (err) { next(err); }
};