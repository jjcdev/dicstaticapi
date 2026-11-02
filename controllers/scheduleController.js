const { Op } = require("sequelize");
const {
  WeeklySchedule,
  WeeklyScheduleSlot,
  Workshop,
  User,
} = require("../models");
const { ROLES, SCHEDULE_STATUS } = require("../utils/constants");
const {
  validateWeeklySchedulePayload,
  validateSlotPayload,
  normalizeToSunday,
  currentWeekSunday,
  addDays,
} = require("../utils/validators");
const { push, NOTIF_TYPES } = require("../utils/notifications");
const AppError = require("../utils/AppError");

const isSuperuser = (user) =>
  [ROLES.ADMIN, ROLES.PRESIDENT, ROLES.SECRETAIRE_GENERALE].includes(user.role);

const isWorkshopManager = (user, workshop) =>
  workshop &&
  (workshop.instructor_id === user.id ||
    workshop.co_instructor_id === user.id);

const INCLUDE = [
  { model: Workshop, as: "workshop", attributes: ["id", "title", "type"] },
  {
    model: WeeklyScheduleSlot,
    as: "slots",
    separate: false,
  },
];

const sortSlots = (slots) =>
  [...slots].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    if (a.start_time < b.start_time) return -1;
    if (a.start_time > b.start_time) return 1;
    return (a.display_order || 0) - (b.display_order || 0);
  });

const findScheduleWithAccess = async (user, id) => {
  const schedule = await WeeklySchedule.findByPk(id, {
    include: [
      { model: Workshop, as: "workshop" },
      { model: WeeklyScheduleSlot, as: "slots" },
    ],
  });
  if (!schedule) throw new AppError("Planning introuvable.", 404);

  const allowed =
    isSuperuser(user) ||
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
    if (workshop.status !== "active") {
      return res.status(400).json({ message: "Ce pôle n'est pas actif." });
    }

    if (!isSuperuser(req.user) && !isWorkshopManager(req.user, workshop)) {
      return res.status(403).json({
        message: "Vous ne pouvez pas créer un planning pour ce pôle.",
      });
    }

    // SG/admin/president → draft. Chef/adjoint → proposed.
    const isManagingRole = [
      ROLES.ADMIN,
      ROLES.PRESIDENT,
      ROLES.SECRETAIRE_GENERALE,
    ].includes(req.user.role);
    const status = isManagingRole
      ? SCHEDULE_STATUS.DRAFT
      : SCHEDULE_STATUS.PROPOSED;

    const schedule = await WeeklySchedule.create({
      workshop_id: data.workshop_id,
      week_start: data.week_start,
      status,
      created_by: req.user.id,
    });

    // Notification aux SG si proposé par un chef
    if (status === SCHEDULE_STATUS.PROPOSED) {
      const sgs = await User.findAll({
        where: { role: ROLES.SECRETAIRE_GENERALE, is_active: true },
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
  } catch (err) {
    next(err);
  }
};

/* ─────────── Liste ─────────── */

exports.list = async (req, res, next) => {
  try {
    const where = {};

    if (
      typeof req.query.status === "string" &&
      Object.values(SCHEDULE_STATUS).includes(req.query.status)
    ) {
      where.status = req.query.status;
    }
    if (typeof req.query.workshop_id === "string" && req.query.workshop_id) {
      where.workshop_id = req.query.workshop_id;
    }
    if (typeof req.query.week === "string" && req.query.week) {
      const w = normalizeToSunday(req.query.week);
      if (w) where.week_start = w;
    }

    if (!isSuperuser(req.user)) {
      if (![ROLES.INSTRUCTOR, ROLES.CO_INSTRUCTOR].includes(req.user.role)) {
        return res.status(403).json({ message: "Accès refusé." });
      }
      const owned = await Workshop.findAll({
        where: {
          [Op.or]: [
            { instructor_id: req.user.id },
            { co_instructor_id: req.user.id },
          ],
        },
        attributes: ["id"],
      });
      where.workshop_id = { [Op.in]: owned.map((w) => w.id) };
    }

    const schedules = await WeeklySchedule.findAll({
      where,
      include: INCLUDE,
      order: [
        ["week_start", "DESC"],
        ["created_at", "DESC"],
      ],
      limit: 200,
    });

    // Tri des slots
    const result = schedules.map((s) => {
      const obj = s.toJSON();
      obj.slots = sortSlots(obj.slots || []);
      return obj;
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Détail ─────────── */

exports.getOne = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);
    const obj = schedule.toJSON();
    obj.slots = sortSlots(obj.slots || []);
    res.json(obj);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mise à jour (statut / metadata) ─────────── */

exports.update = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);

    // On n'autorise pas le changement de workshop ou de week_start
    // (il faut supprimer et recréer). Seul le statut est géré par publish/unpublish.

    res.json(schedule);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Suppression ─────────── */

exports.remove = async (req, res, next) => {
  try {
    const schedule = await WeeklySchedule.findByPk(req.params.id, {
      include: [{ model: Workshop, as: "workshop" }],
    });
    if (!schedule) return res.status(404).json({ message: "Planning introuvable." });

    // SG/admin/president : peut toujours supprimer
    if (isSuperuser(req.user)) {
      await schedule.destroy();
      return res.json({ message: "Planning supprimé." });
    }

    // Chef : peut supprimer seulement SES propositions non publiées
    if (!isWorkshopManager(req.user, schedule.workshop)) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    if (schedule.status === SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({
        message: "Un planning publié ne peut être supprimé que par la SG.",
      });
    }

    await schedule.destroy();
    res.json({ message: "Proposition supprimée." });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Publier (SG / président / admin) ─────────── */

exports.publish = async (req, res, next) => {
  try {
    if (!isSuperuser(req.user)) {
      return res.status(403).json({
        message: "Seule la secrétaire générale (ou président/admin) peut publier.",
      });
    }

    const schedule = await WeeklySchedule.findByPk(req.params.id, {
      include: [{ model: Workshop, as: "workshop" }],
    });
    if (!schedule) return res.status(404).json({ message: "Planning introuvable." });
    if (schedule.status === SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({ message: "Ce planning est déjà publié." });
    }

    await schedule.update({
      status: SCHEDULE_STATUS.PUBLISHED,
      published_by: req.user.id,
      published_at: new Date(),
    });

    // Notification aux chefs de pôle
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
  } catch (err) {
    next(err);
  }
};

/* ─────────── Dépublier (SG / président / admin) ─────────── */

exports.unpublish = async (req, res, next) => {
  try {
    if (!isSuperuser(req.user)) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const schedule = await WeeklySchedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ message: "Planning introuvable." });
    if (schedule.status !== SCHEDULE_STATUS.PUBLISHED) {
      return res.status(400).json({ message: "Ce planning n'est pas publié." });
    }

    await schedule.update({
      status: SCHEDULE_STATUS.DRAFT,
      published_by: null,
      published_at: null,
    });

    res.json({ message: "Planning repassé en brouillon.", schedule });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Slots ─────────── */

exports.addSlot = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);

    // Chef ne peut éditer que son propre pôle (déjà vérifié), et seulement en proposed/draft
    if (
      !isSuperuser(req.user) &&
      schedule.status === SCHEDULE_STATUS.PUBLISHED
    ) {
      return res.status(400).json({
        message: "Un planning publié ne peut être modifié que par la SG.",
      });
    }

    const data = validateSlotPayload(req.body);
    const slot = await WeeklyScheduleSlot.create({
      schedule_id: schedule.id,
      ...data,
    });

    res.status(201).json(slot);
  } catch (err) {
    next(err);
  }
};

exports.updateSlot = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);

    if (
      !isSuperuser(req.user) &&
      schedule.status === SCHEDULE_STATUS.PUBLISHED
    ) {
      return res.status(400).json({
        message: "Un planning publié ne peut être modifié que par la SG.",
      });
    }

    const slot = await WeeklyScheduleSlot.findOne({
      where: { id: req.params.slotId, schedule_id: schedule.id },
    });
    if (!slot) return res.status(404).json({ message: "Créneau introuvable." });

    const data = validateSlotPayload(req.body, { partial: true });
    await slot.update(data);
    res.json(slot);
  } catch (err) {
    next(err);
  }
};

exports.deleteSlot = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);

    if (
      !isSuperuser(req.user) &&
      schedule.status === SCHEDULE_STATUS.PUBLISHED
    ) {
      return res.status(400).json({
        message: "Un planning publié ne peut être modifié que par la SG.",
      });
    }

    const slot = await WeeklyScheduleSlot.findOne({
      where: { id: req.params.slotId, schedule_id: schedule.id },
    });
    if (!slot) return res.status(404).json({ message: "Créneau introuvable." });

    await slot.destroy();
    res.json({ message: "Créneau supprimé." });
  } catch (err) {
    next(err);
  }
};

exports.reorderSlots = async (req, res, next) => {
  try {
    const schedule = await findScheduleWithAccess(req.user, req.params.id);

    if (
      !isSuperuser(req.user) &&
      schedule.status === SCHEDULE_STATUS.PUBLISHED
    ) {
      return res.status(400).json({
        message: "Un planning publié ne peut être modifié que par la SG.",
      });
    }

    const { order } = req.body || {};
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({
        message: "Tableau 'order' requis : [{ id, display_order }].",
      });
    }

    for (const entry of order) {
      const id = String(entry.id);
      const pos = parseInt(entry.display_order, 10);
      if (!Number.isInteger(pos) || pos < 0) continue;
      await WeeklyScheduleSlot.update(
        { display_order: pos },
        { where: { id, schedule_id: schedule.id } }
      );
    }

    const slots = await WeeklyScheduleSlot.findAll({
      where: { schedule_id: schedule.id },
    });
    res.json(sortSlots(slots));
  } catch (err) {
    next(err);
  }
};

/* ─────────── Liste des plannings manquants (SG) ─────────── */

exports.missing = async (req, res, next) => {
  try {
    if (!isSuperuser(req.user)) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    const week = normalizeToSunday(req.query.week) || currentWeekSunday();

    const workshops = await Workshop.findAll({
      where: { status: "active" },
      include: [
        { model: User, as: "instructor", attributes: ["id", "first_name", "last_name"] },
      ],
      attributes: ["id", "title", "type"],
    });

    const publishedSchedules = await WeeklySchedule.findAll({
      where: {
        week_start: week,
        status: SCHEDULE_STATUS.PUBLISHED,
      },
      attributes: ["workshop_id"],
    });
    const withPublished = new Set(
      publishedSchedules.map((s) => s.workshop_id)
    );

    const missing = workshops
      .filter((w) => !withPublished.has(w.id))
      .map((w) => ({
        workshop_id: w.id,
        workshop_title: w.title,
        workshop_type: w.type,
        chef_name: w.instructor
          ? `${w.instructor.first_name} ${w.instructor.last_name}`
          : null,
      }));

    res.json({
      week_start: week,
      week_end: addDays(week, 6),
      missing,
    });
  } catch (err) {
    next(err);
  }
};