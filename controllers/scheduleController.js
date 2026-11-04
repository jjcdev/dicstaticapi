const {
  WeeklySchedule,
  WeeklyScheduleSlot,
  Workshop,
  User,
} = require("../models");
const {
  ROLES,
  SCHEDULE_STATUS,
  SCHEDULE_MANAGER_ROLES,
} = require("../utils/constants");
const {
  validateWeeklySchedulePayload,
  validateSlotPayload,
  normalizeToSunday,
  currentWeekSunday,
  addDays,
} = require("../utils/validators");
const { push, NOTIF_TYPES } = require("../utils/notifications");
const { sanitizeText } = require("../utils/sanitize");
const AppError = require("../utils/AppError");
const {
  isWorkshopManager,
} = require("../middlewares/rbac");

const INCLUDE = [
  { model: Workshop, as: "workshop", attributes: ["id", "title", "type", "instructor_id", "co_instructor_id"] },
  { model: WeeklyScheduleSlot, as: "slots" },
];

const sortSlots = (slots) =>
  [...slots].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    if (a.start_time < b.start_time) return -1;
    if (a.start_time > b.start_time) return 1;
    return (a.display_order || 0) - (b.display_order || 0);
  });

const isScheduleManager = (user) => SCHEDULE_MANAGER_ROLES.includes(user.role);
const isAdmin = (user) => user.role === ROLES.ADMIN;

const findScheduleWithAccess = async (user, id) => {
  const schedule = await WeeklySchedule.findByPk(id, {
    include: [
      { model: Workshop, as: "workshop" },
      { model: WeeklyScheduleSlot, as: "slots" },
    ],
  });
  if (!schedule) throw new AppError("Planning introuvable.", 404);

  const allowed =
    isAdmin(user) ||
    isScheduleManager(user) ||
    isWorkshopManager(user, schedule.workshop);
  if (!allowed) throw new AppError("Accès refusé.", 403);

  return schedule;
};

/* ─────────── Création ─────────── */

exports.create = async (req, res, next) => {
  try {
    const data = validateWeeklySchedulePayload(req.body);
    const workshop = await Workshop.findByPk(data.workshop_id);
    if (!workshop) return res.status(404).json({ message: "Pôle introuvable." });
    if (workshop.status !== "active") return res.status(400).json({ message: "Ce pôle n'est pas actif." });

    const canCreate =
      isAdmin(req.user) ||
      isScheduleManager(req.user) ||
      isWorkshopManager(req.user, workshop);
    if (!canCreate) return res.status(403).json({ message: "Accès refusé." });

    // SG + secrétaire adjoint → draft. Chef/adjoint → proposed.
    const status = isScheduleManager(req.user) || isAdmin(req.user)
      ? SCHEDULE_STATUS.DRAFT
      : SCHEDULE_STATUS.PROPOSED;

    const schedule = await WeeklySchedule.create({
      workshop_id: data.workshop_id,
      week_start: data.week_start,
      status,
      created_by: req.user.id,
    });

    // Notifier SG si proposé
    if (status === SCHEDULE_STATUS.PROPOSED) {
      const sgs = await User.findAll({
        where: {
          role: { [require("sequelize").Op.in]: SCHEDULE_MANAGER_ROLES },
          is_active: true,
        },
        attributes: ["id"],
      });
      for (const sg of sgs) {
        push(sg.id, NOTIF_TYPES.SCHEDULE_PROPOSED, {
          schedule_id: schedule.id,
          workshop_title: workshop.title,
          week_start: schedule.week_start,
        });
      }
    }

    const full = await WeeklySchedule.findByPk(schedule.id, { include: INCLUDE });
    res.status(201).json(full);
  } catch (err) { next(err); }
};

/* ─────────── Liste / détail ─────────── */

exports.list = async (req, res, next) => {
  try {
    const { Op } = require("sequelize");
    const where = {};
    if (typeof req.query.status === "string" && Object.values(SCHEDULE_STATUS).includes(req.query.status)) {
      where.status = req.query.status;
    }
    if (typeof req.query.workshop_id === "string" && req.query.workshop_id) where.workshop_id = req.query.workshop_id;
    if (typeof req.query.week === "string" && req.query.week) {
      const w = normalizeToSunday(req.query.week);
      if (w) where.week_start = w;
    }

    const canSeeAll = isAdmin(req.user) || isScheduleManager(req.user);
    if (!canSeeAll) {
      if (![ROLES.INSTRUCTOR, ROLES.CO_INSTRUCTOR].includes(req.user.role)) {
        return res.status(403).json({ message: "Accès refusé." });
      }
      const owned = await Workshop.findAll({
        where: { [Op.or]: [{ instructor_id: req.user.id }, { co_instructor_id: req.user.id }] },
        attributes: ["id"],
      });
      where.workshop_id = { [Op.in]: owned.map((w) => w.id) };
    }

    const schedules = await WeeklySchedule.findAll({
      where,
      include: INCLUDE,
      order: [["week_start", "DESC"], ["created_at", "DESC"]],
      limit: 200,
    });

    const result = schedules.map((s) => {
      const obj = s.toJSON();
      obj.slots = sortSlots(obj.slots || []);
      return obj;
    });
    res.json(result);
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);
    const obj = schedule.toJSON();
    obj.slots = sortSlots(obj.slots || []);
    res.json(obj);
  } catch (err) { next(err); }
};

/* ─────────── Suppression ─────────── */

exports.remove = async (req, res, next) => {
  try {
    const schedule = await WeeklySchedule.findByPk(req.params.id, {
      include: [{ model: Workshop, as: "workshop" }],
    });
    if (!schedule) return res.status(404).json({ message: "Planning introuvable." });

    if (isAdmin(req.user) || isScheduleManager(req.user)) {
      await schedule.destroy();
      return res.json({ message: "Planning supprimé." });
    }

    if (!isWorkshopManager(req.user, schedule.workshop)) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    if (schedule.status === SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({ message: "Un planning publié ne peut être supprimé que par la SG." });
    }

    await schedule.destroy();
    res.json({ message: "Proposition supprimée." });
  } catch (err) { next(err); }
};

/* ─────────── Publication (SG + secrétaire adjoint SEULS) ─────────── */

exports.publish = async (req, res, next) => {
  try {
    if (!isScheduleManager(req.user) && !isAdmin(req.user)) {
      return res.status(403).json({ message: "Seule la secrétaire générale (ou adjointe) peut publier." });
    }

    const schedule = await WeeklySchedule.findByPk(req.params.id, {
      include: [{ model: Workshop, as: "workshop" }],
    });
    if (!schedule) return res.status(404).json({ message: "Planning introuvable." });
    if (schedule.status === SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({ message: "Ce planning est déjà publié." });
    }
    if (schedule.status === SCHEDULE_STATUS.REJECTED) {
      return res.status(400).json({ message: "Un planning rejeté ne peut pas être publié — demandez une nouvelle proposition." });
    }

    await schedule.update({
      status: SCHEDULE_STATUS.PUBLISHED,
      published_by: req.user.id,
      published_at: new Date(),
    });

    const managers = [
      schedule.workshop.instructor_id,
      schedule.workshop.co_instructor_id,
    ].filter(Boolean);
    for (const mgr of managers) {
      push(mgr, NOTIF_TYPES.SCHEDULE_PUBLISHED, {
        schedule_id: schedule.id,
        workshop_title: schedule.workshop.title,
        week_start: schedule.week_start,
      });
    }

    const full = await WeeklySchedule.findByPk(schedule.id, { include: INCLUDE });
    res.json({ message: "Planning publié.", schedule: full });
  } catch (err) { next(err); }
};

/* ─────────── Dépublier ─────────── */

exports.unpublish = async (req, res, next) => {
  try {
    if (!isScheduleManager(req.user) && !isAdmin(req.user)) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    const schedule = await WeeklySchedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ message: "Planning introuvable." });
    if (schedule.status !== SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({ message: "Ce planning n'est pas publié." });
    }
    await schedule.update({ status: SCHEDULE_STATUS.DRAFT, published_by: null, published_at: null });
    res.json({ message: "Planning repassé en brouillon.", schedule });
  } catch (err) { next(err); }
};

/* ─────────── Rejet (SG + secrétaire adjoint SEULS) ─────────── */

exports.reject = async (req, res, next) => {
  try {
    if (!isScheduleManager(req.user) && !isAdmin(req.user)) {
      return res.status(403).json({ message: "Seule la secrétaire générale (ou adjointe) peut rejeter." });
    }

    const reason = req.body?.reason;
    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return res.status(400).json({ message: "Motif de rejet requis (5 caractères min)." });
    }

    const schedule = await WeeklySchedule.findByPk(req.params.id, {
      include: [{ model: Workshop, as: "workshop" }],
    });
    if (!schedule) return res.status(404).json({ message: "Planning introuvable." });
    if (![SCHEDULE_STATUS.PROPOSED, SCHEDULE_STATUS.DRAFT].includes(schedule.status)) {
      return res.status(400).json({ message: `Statut actuel : ${schedule.status}. Rejet impossible.` });
    }

    const reasonText = sanitizeText(reason).slice(0, 1000);

    await schedule.update({
      status: SCHEDULE_STATUS.REJECTED,
      rejected_by: req.user.id,
      rejected_at: new Date(),
      rejection_reason: reasonText,
    });

    // Notifier le chef + adjoint
    const managers = [
      schedule.workshop.instructor_id,
      schedule.workshop.co_instructor_id,
    ].filter(Boolean);
    for (const mgr of managers) {
      push(mgr, NOTIF_TYPES.SCHEDULE_REJECTED, {
        schedule_id: schedule.id,
        workshop_title: schedule.workshop.title,
        week_start: schedule.week_start,
        reason: reasonText,
      });
    }

    res.json({ message: "Planning rejeté.", schedule });
  } catch (err) { next(err); }
};

/* ─────────── Slots (chef propose + SG peut éditer) ─────────── */

exports.addSlot = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);
    if (!isAdmin(req.user) && !isScheduleManager(req.user) && schedule.status === SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({ message: "Un planning publié ne peut être modifié que par la SG." });
    }
    if (schedule.status === SCHEDULE_STATUS.REJECTED) {
      return res.status(400).json({ message: "Ce planning a été rejeté. Créez-en un nouveau." });
    }
    const data = validateSlotPayload(req.body);
    const slot = await WeeklyScheduleSlot.create({ schedule_id: schedule.id, ...data });
    res.status(201).json(slot);
  } catch (err) { next(err); }
};

exports.updateSlot = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);
    if (!isAdmin(req.user) && !isScheduleManager(req.user) && schedule.status === SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({ message: "Un planning publié ne peut être modifié que par la SG." });
    }
    if (schedule.status === SCHEDULE_STATUS.REJECTED) {
      return res.status(400).json({ message: "Ce planning a été rejeté." });
    }
    const slot = await WeeklyScheduleSlot.findOne({ where: { id: req.params.slotId, schedule_id: schedule.id } });
    if (!slot) return res.status(404).json({ message: "Créneau introuvable." });
    const data = validateSlotPayload(req.body, { partial: true });
    await slot.update(data);
    res.json(slot);
  } catch (err) { next(err); }
};

exports.deleteSlot = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);
    if (!isAdmin(req.user) && !isScheduleManager(req.user) && schedule.status === SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({ message: "Un planning publié ne peut être modifié que par la SG." });
    }
    if (schedule.status === SCHEDULE_STATUS.REJECTED) {
      return res.status(400).json({ message: "Ce planning a été rejeté." });
    }
    const slot = await WeeklyScheduleSlot.findOne({ where: { id: req.params.slotId, schedule_id: schedule.id } });
    if (!slot) return res.status(404).json({ message: "Créneau introuvable." });
    await slot.destroy();
    res.json({ message: "Créneau supprimé." });
  } catch (err) { next(err); }
};

exports.reorderSlots = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);
    if (!isAdmin(req.user) && !isScheduleManager(req.user) && schedule.status === SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({ message: "Un planning publié ne peut être modifié que par la SG." });
    }
    if (schedule.status === SCHEDULE_STATUS.REJECTED) {
      return res.status(400).json({ message: "Ce planning a été rejeté." });
    }
    const { order } = req.body || {};
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ message: "Tableau 'order' requis : [{ id, display_order }]." });
    }
    for (const entry of order) {
      const id = String(entry.id);
      const pos = parseInt(entry.display_order, 10);
      if (!Number.isInteger(pos) || pos < 0) continue;
      await WeeklyScheduleSlot.update({ display_order: pos }, { where: { id, schedule_id: schedule.id } });
    }
    const slots = await WeeklyScheduleSlot.findAll({ where: { schedule_id: schedule.id } });
    res.json(sortSlots(slots));
  } catch (err) { next(err); }
};

/* ─────────── Missing ─────────── */

exports.missing = async (req, res, next) => {
  try {
    if (!isAdmin(req.user) && !isScheduleManager(req.user)) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    const week = normalizeToSunday(req.query.week) || currentWeekSunday();
    const workshops = await Workshop.findAll({
      where: { status: "active" },
      include: [{ model: User, as: "instructor", attributes: ["id", "first_name", "last_name"] }],
      attributes: ["id", "title", "type"],
    });
    const publishedSchedules = await WeeklySchedule.findAll({
      where: { week_start: week, status: SCHEDULE_STATUS.PUBLISHED },
      attributes: ["workshop_id"],
    });
    const withPublished = new Set(publishedSchedules.map((s) => s.workshop_id));
    const missing = workshops
      .filter((w) => !withPublished.has(w.id))
      .map((w) => ({
        workshop_id: w.id,
        workshop_title: w.title,
        workshop_type: w.type,
        chef_name: w.instructor ? `${w.instructor.first_name} ${w.instructor.last_name}` : null,
      }));
    res.json({ week_start: week, week_end: addDays(week, 6), missing });
  } catch (err) { next(err); }
};