const { Op } = require("sequelize");
const {
  Workshop,
  WeeklySchedule,
  WeeklyScheduleSlot,
  User,
} = require("../models");
const { SCHEDULE_STATUS } = require("../utils/constants");
const {
  normalizeToSunday,
  currentWeekSunday,
  addDays,
} = require("../utils/validators");

const sortSlots = (slots) =>
  [...slots].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    if (a.start_time < b.start_time) return -1;
    if (a.start_time > b.start_time) return 1;
    return (a.display_order || 0) - (b.display_order || 0);
  });

/* ─────────── Tous les pôles pour une semaine ─────────── */

exports.listWeek = async (req, res, next) => {
  try {
    const week =
      normalizeToSunday(req.query.week) || currentWeekSunday();

    const workshops = await Workshop.findAll({
      where: { status: "active" },
      attributes: ["id", "title", "type", "location"],
      order: [["title", "ASC"]],
    });

    const workshopIds = workshops.map((w) => w.id);

    const schedules = await WeeklySchedule.findAll({
      where: {
        week_start: week,
        status: SCHEDULE_STATUS.PUBLISHED,
        workshop_id: { [Op.in]: workshopIds },
      },
      include: [
        { model: WeeklyScheduleSlot, as: "slots" },
      ],
    });

    const byWorkshop = new Map();
    schedules.forEach((s) => {
      byWorkshop.set(s.workshop_id, s);
    });

    const result = workshops.map((w) => {
      const s = byWorkshop.get(w.id);
      return {
        workshop_id: w.id,
        workshop_title: w.title,
        workshop_type: w.type,
        workshop_location: w.location,
        has_schedule: !!s,
        slots: s ? sortSlots(s.slots || []) : [],
      };
    });

    res.json({
      week_start: week,
      week_end: addDays(week, 6),
      workshops: result,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Planning d'un pôle pour une semaine ─────────── */

exports.getWorkshopWeek = async (req, res, next) => {
  try {
    const week =
      normalizeToSunday(req.query.week) || currentWeekSunday();

    const workshop = await Workshop.findByPk(req.params.workshopId, {
      attributes: ["id", "title", "type", "location", "status"],
    });
    if (!workshop || workshop.status !== "active") {
      return res.status(404).json({ message: "Pôle introuvable." });
    }

    const schedule = await WeeklySchedule.findOne({
      where: {
        workshop_id: workshop.id,
        week_start: week,
        status: SCHEDULE_STATUS.PUBLISHED,
      },
      include: [{ model: WeeklyScheduleSlot, as: "slots" }],
    });

    res.json({
      week_start: week,
      week_end: addDays(week, 6),
      workshop: {
        id: workshop.id,
        title: workshop.title,
        type: workshop.type,
        location: workshop.location,
      },
      has_schedule: !!schedule,
      slots: schedule ? sortSlots(schedule.slots || []) : [],
    });
  } catch (err) {
    next(err);
  }
};