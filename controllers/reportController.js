const { Op } = require("sequelize");
const {
  SessionReport,
  SessionReportAttendee,
  Workshop,
  WorkshopStudent,
  User,
  sequelize,
} = require("../models");
const { ROLES, ENROLLMENT_STATUS } = require("../utils/constants");
const {
  validateReportPayload,
  validateAttendeeEntry,
} = require("../utils/validators");
const AppError = require("../utils/AppError");
const { isWorkshopManager } = require("../middlewares/rbac");

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const isSuperuser = (user) =>
  [ROLES.ADMIN, ROLES.PRESIDENT, ROLES.VICE_PRESIDENT].includes(user.role);

const WORKSHOP_ATTRS = [
  "id",
  "title",
  "type",
  "instructor_id",
  "co_instructor_id",
];

const includeFull = [
  { model: Workshop, as: "workshop", attributes: WORKSHOP_ATTRS },
  { model: User, as: "author", attributes: ["id", "first_name", "last_name"] },
];

const includeFullAttendees = [
  ...includeFull,
  {
    model: SessionReportAttendee,
    as: "attendees",
    include: [
      {
        model: User,
        as: "student",
        attributes: ["id", "first_name", "last_name", "email"],
      },
    ],
  },
];

/* ─────────── Helpers de calcul de fenêtre d'édition ─────────── */

const computeEditableUntil = (report) => {
  const base = report.client_created_at || report.createdAt;
  if (!base) return null;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + EDIT_WINDOW_MS);
};

const isEditable = (report) => {
  const until = computeEditableUntil(report);
  if (!until) return true;
  return new Date() <= until;
};

const getEditableUntilISO = (report) => {
  const d = computeEditableUntil(report);
  return d ? d.toISOString() : null;
};

/* ─────────── Helpers de création ─────────── */

const getActiveStudents = async (workshopId) => {
  const enrollments = await WorkshopStudent.findAll({
    where: { workshop_id: workshopId, status: ENROLLMENT_STATUS.ACTIVE },
    include: [
      { model: User, as: "student", attributes: ["id", "first_name", "last_name"] },
    ],
  });
  return enrollments.map((e) => e.student).filter(Boolean);
};

const buildAttendees = async (workshopId, provided = []) => {
  const activeStudents = await getActiveStudents(workshopId);
  const activeSet = new Set(activeStudents.map((s) => s.id));
  const providedMap = new Map();

  for (const entry of provided) {
    try {
      const v = validateAttendeeEntry(entry);
      if (activeSet.has(v.student_id)) {
        providedMap.set(v.student_id, v);
      }
    } catch {
      /* ignore invalides */
    }
  }

  return activeStudents.map((s) => {
    const p = providedMap.get(s.id);
    return p || { student_id: s.id, status: "absent", absence_reason: null };
  });
};

/* ─────────── Création ─────────── */

exports.create = async (req, res, next) => {
  try {
    const data = validateReportPayload(req.body);

    const workshop = await Workshop.findByPk(data.workshop_id);
    if (!workshop) {
      return res.status(404).json({ message: "Pôle introuvable." });
    }
    if (!isSuperuser(req.user) && !isWorkshopManager(req.user, workshop)) {
      return res.status(403).json({
        message: "Vous n'êtes pas responsable de ce pôle.",
      });
    }

    if (data.client_id) {
      const existing = await SessionReport.findOne({
        where: { client_id: data.client_id },
        include: includeFullAttendees,
      });
      if (existing) return res.status(200).json(existing);
    }

    const instructorUser = workshop.instructor_id
      ? await User.findByPk(workshop.instructor_id, {
          attributes: ["first_name", "last_name"],
        })
      : null;
    const coUser = workshop.co_instructor_id
      ? await User.findByPk(workshop.co_instructor_id, {
          attributes: ["first_name", "last_name"],
        })
      : null;

    const attendeesData = await buildAttendees(
      workshop.id,
      Array.isArray(req.body.attendees) ? req.body.attendees : []
    );

    const result = await sequelize.transaction(async (t) => {
      const report = await SessionReport.create(
        {
          ...data,
          author_id: req.user.id,
          instructor_name: instructorUser
            ? `${instructorUser.first_name} ${instructorUser.last_name}`
            : null,
          co_instructor_name: coUser
            ? `${coUser.first_name} ${coUser.last_name}`
            : null,
        },
        { transaction: t }
      );

      if (attendeesData.length > 0) {
        await SessionReportAttendee.bulkCreate(
          attendeesData.map((a) => ({
            report_id: report.id,
            student_id: a.student_id,
            status: a.status,
            absence_reason: a.absence_reason,
            marked_at: new Date(),
          })),
          { transaction: t }
        );
      }

      return report;
    });

    const full = await SessionReport.findByPk(result.id, {
      include: includeFullAttendees,
    });
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Liste ─────────── */

exports.list = async (req, res, next) => {
  try {
    const where = {};
    if (typeof req.query.workshop_id === "string" && req.query.workshop_id) {
      where.workshop_id = req.query.workshop_id;
    }
    if (typeof req.query.from === "string" && req.query.from) {
      where.date = { ...(where.date || {}), [Op.gte]: req.query.from };
    }
    if (typeof req.query.to === "string" && req.query.to) {
      where.date = { ...(where.date || {}), [Op.lte]: req.query.to };
    }

    if (!isSuperuser(req.user) && req.user.role !== ROLES.SECRETAIRE_GENERALE) {
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

    const reports = await SessionReport.findAll({
      where,
      include: includeFull,
      order: [
        ["date", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: 200,
    });

    res.json(reports);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Détail ─────────── */

exports.getOne = async (req, res, next) => {
  try {
    const report = await SessionReport.findByPk(req.params.id, {
      include: includeFullAttendees,
    });
    if (!report) return res.status(404).json({ message: "Rapport introuvable." });

    const canSee =
      isSuperuser(req.user) ||
      req.user.role === ROLES.SECRETAIRE_GENERALE ||
      isWorkshopManager(req.user, report.workshop);
    if (!canSee) return res.status(403).json({ message: "Accès refusé." });

    const obj = report.toJSON();
    obj.editable_until = getEditableUntilISO(report);
    obj.editable = isEditable(report);
    res.json(obj);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mise à jour ─────────── */

exports.update = async (req, res, next) => {
  try {
    const report = await SessionReport.findByPk(req.params.id, {
      include: [{ model: Workshop, as: "workshop" }],
    });
    if (!report) return res.status(404).json({ message: "Rapport introuvable." });

    if (!isSuperuser(req.user) && !isWorkshopManager(req.user, report.workshop)) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    if (!isSuperuser(req.user) && !isEditable(report)) {
      return res.status(403).json({
        message: "Fenêtre d'édition expirée (24h après création).",
        editable_until: getEditableUntilISO(report),
      });
    }

    const data = validateReportPayload(req.body, { partial: true });
    delete data.workshop_id;
    delete data.date;
    delete data.client_id;
    delete data.client_created_at;

    await report.update(data);

    const full = await SessionReport.findByPk(report.id, {
      include: includeFullAttendees,
    });
    res.json(full);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Suppression ─────────── */

exports.remove = async (req, res, next) => {
  try {
    const report = await SessionReport.findByPk(req.params.id, {
      include: [{ model: Workshop, as: "workshop" }],
    });
    if (!report) return res.status(404).json({ message: "Rapport introuvable." });

    if (!isSuperuser(req.user) && !isWorkshopManager(req.user, report.workshop)) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    await report.destroy();
    res.json({ message: "Rapport supprimé." });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mise à jour attendees (bulk manuel) ─────────── */

exports.updateAttendees = async (req, res, next) => {
  try {
    const report = await SessionReport.findByPk(req.params.id, {
      include: [{ model: Workshop, as: "workshop" }],
    });
    if (!report) return res.status(404).json({ message: "Rapport introuvable." });

    if (!isSuperuser(req.user) && !isWorkshopManager(req.user, report.workshop)) {
      return res.status(403).json({ message: "Accès refusé." });
    }

    if (!isSuperuser(req.user) && !isEditable(report)) {
      return res.status(403).json({
        message: "Fenêtre d'édition expirée (24h après création).",
        editable_until: getEditableUntilISO(report),
      });
    }

    const entries = req.body.attendees;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ message: "attendees[] requis." });
    }

    const existing = await SessionReportAttendee.findAll({
      where: { report_id: report.id },
    });
    const existingMap = new Map(existing.map((a) => [a.student_id, a]));

    for (const entry of entries) {
      let v;
      try {
        v = validateAttendeeEntry(entry);
      } catch {
        continue;
      }
      const row = existingMap.get(v.student_id);
      if (!row) continue;
      await row.update({
        status: v.status,
        absence_reason: v.absence_reason,
        marked_at: new Date(),
      });
    }

    const full = await SessionReport.findByPk(report.id, {
      include: includeFullAttendees,
    });
    res.json(full);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Bulk sync (offline) ─────────── */

exports.bulkSync = async (req, res, next) => {
  try {
    const reports = req.body.reports;
    if (!Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({ message: "reports[] requis." });
    }
    if (reports.length > 50) {
      return res.status(400).json({ message: "Maximum 50 rapports par sync." });
    }

    const results = [];
    let synced = 0;
    let failed = 0;

    for (const payload of reports) {
      try {
        if (!payload.client_id) {
          throw new AppError("client_id requis pour le sync.", 400);
        }

        const existing = await SessionReport.findOne({
          where: { client_id: payload.client_id },
        });

        if (existing) {
          if (!isSuperuser(req.user) && !isEditable(existing)) {
            results.push({
              client_id: payload.client_id,
              status: "rejected",
              error: "Fenêtre d'édition expirée.",
            });
            failed++;
            continue;
          }

          const data = validateReportPayload(payload, { partial: true });
          delete data.workshop_id;
          delete data.date;
          delete data.client_id;
          delete data.client_created_at;

          await existing.update(data);

          if (Array.isArray(payload.attendees)) {
            const rows = await SessionReportAttendee.findAll({
              where: { report_id: existing.id },
            });
            const map = new Map(rows.map((a) => [a.student_id, a]));
            for (const entry of payload.attendees) {
              let v;
              try {
                v = validateAttendeeEntry(entry);
              } catch {
                continue;
              }
              const row = map.get(v.student_id);
              if (!row) continue;
              await row.update({
                status: v.status,
                absence_reason: v.absence_reason,
                marked_at: new Date(),
              });
            }
          }

          results.push({
            client_id: payload.client_id,
            status: "updated",
            report_id: existing.id,
          });
          synced++;
        } else {
          const data = validateReportPayload(payload);

          const workshop = await Workshop.findByPk(data.workshop_id);
          if (!workshop) throw new AppError("Pôle introuvable.", 404);
          if (!isSuperuser(req.user) && !isWorkshopManager(req.user, workshop)) {
            throw new AppError("Non responsable de ce pôle.", 403);
          }

          const instructorUser = workshop.instructor_id
            ? await User.findByPk(workshop.instructor_id, {
                attributes: ["first_name", "last_name"],
              })
            : null;
          const coUser = workshop.co_instructor_id
            ? await User.findByPk(workshop.co_instructor_id, {
                attributes: ["first_name", "last_name"],
              })
            : null;

          const attendeesData = await buildAttendees(
            workshop.id,
            Array.isArray(payload.attendees) ? payload.attendees : []
          );

          const report = await sequelize.transaction(async (t) => {
            const r = await SessionReport.create(
              {
                ...data,
                author_id: req.user.id,
                instructor_name: instructorUser
                  ? `${instructorUser.first_name} ${instructorUser.last_name}`
                  : null,
                co_instructor_name: coUser
                  ? `${coUser.first_name} ${coUser.last_name}`
                  : null,
              },
              { transaction: t }
            );
            if (attendeesData.length > 0) {
              await SessionReportAttendee.bulkCreate(
                attendeesData.map((a) => ({
                  report_id: r.id,
                  student_id: a.student_id,
                  status: a.status,
                  absence_reason: a.absence_reason,
                  marked_at: new Date(),
                })),
                { transaction: t }
              );
            }
            return r;
          });

          results.push({
            client_id: payload.client_id,
            status: "created",
            report_id: report.id,
          });
          synced++;
        }
      } catch (e) {
        results.push({
          client_id: payload.client_id || null,
          status: "rejected",
          error: e.message,
        });
        failed++;
      }
    }

    res.json({ synced, failed, results });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mes absences (étudiant) ─────────── */

exports.myAttendances = async (req, res, next) => {
  try {
    const attendances = await SessionReportAttendee.findAll({
      where: { student_id: req.user.id },
      include: [
        {
          model: SessionReport,
          as: "report",
          include: [
            { model: Workshop, as: "workshop", attributes: ["id", "title"] },
          ],
        },
      ],
      order: [[{ model: SessionReport, as: "report" }, "date", "DESC"]],
      limit: 200,
    });

    const total = attendances.length;
    const present = attendances.filter((a) => a.status === "present").length;

    res.json({
      attendances,
      stats: {
        total,
        present,
        absent: total - present,
        rate: total > 0 ? Math.round((present / total) * 100) : 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

/* ═══════════════════════════════════════════════════════════
   ─── NOUVEAU : Scan QR code ───
   ═══════════════════════════════════════════════════════════ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valide la précondition commune aux 2 routes de scan :
 *  - rapport existe
 *  - user est chef/adjoint owner du pôle du rapport
 *  - (pour scanMark) fenêtre 24h respectée
 */
async function loadReportForScan(req) {
  const report = await SessionReport.findByPk(req.params.id, {
    include: [
      { model: Workshop, as: "workshop", attributes: WORKSHOP_ATTRS },
    ],
  });
  if (!report) throw new AppError("Rapport introuvable.", 404);

  if (!isSuperuser(req.user) && !isWorkshopManager(req.user, report.workshop)) {
    throw new AppError("Vous n'êtes pas responsable de cet atelier.", 403);
  }

  return report;
}

/**
 * Résout le qrToken → User → SessionReportAttendee.
 * Retourne { student, attendee } ou throw AppError.
 */
async function resolveQrToAttendee(report, qrToken) {
  if (typeof qrToken !== "string" || !UUID_RE.test(qrToken)) {
    throw new AppError("Format de QR code invalide.", 400);
  }

  // Lookup par qr_token (index UNIQUE → rapide)
  const student = await User.findOne({
    where: { qr_token: qrToken, is_active: true },
    attributes: ["id", "first_name", "last_name", "email"],
  });
  if (!student) {
    throw new AppError(
      "QR code inconnu. Il a peut-être été régénéré.",
      404
    );
  }

  const attendee = await SessionReportAttendee.findOne({
    where: { report_id: report.id, student_id: student.id },
  });
  if (!attendee) {
    throw new AppError(
      "Cet étudiant n'est pas attendu à cette séance.",
      404
    );
  }

  return { student, attendee };
}

/**
 * GET /reports/:id/scan/lookup/:qrToken
 * Preview : qui est cet étudiant ? quel est son statut actuel ?
 * Aucune modification.
 */
exports.scanLookup = async (req, res, next) => {
  try {
    const report = await loadReportForScan(req);
    const { student, attendee } = await resolveQrToAttendee(
      report,
      req.params.qrToken
    );

    res.json({
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
      },
      current_status: attendee.status,
      is_in_report: true,
      already_present: attendee.status === "present",
      editable: isEditable(report),
      editable_until: getEditableUntilISO(report),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /reports/:id/scan
 * Marque l'étudiant comme présent. Idempotent si déjà présent.
 */
exports.scanMark = async (req, res, next) => {
  try {
    const report = await loadReportForScan(req);

    if (!isEditable(report)) {
      return res.status(403).json({
        message: "Fenêtre d'édition expirée (24h après création).",
        editable_until: getEditableUntilISO(report),
      });
    }

    const { qr_token } = req.body || {};
    if (!qr_token) {
      return res.status(400).json({ message: "qr_token requis." });
    }

    const { student, attendee } = await resolveQrToAttendee(report, qr_token);

    // Idempotent : déjà présent → retourne sans modifier
    if (attendee.status === "present") {
      return res.json({
        student: {
          id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          email: student.email,
        },
        attendee: {
          student_id: attendee.student_id,
          status: attendee.status,
          marked_at: attendee.marked_at,
          absence_reason: attendee.absence_reason,
        },
        already_present: true,
        message: `${student.first_name} ${student.last_name} était déjà marqué présent.`,
      });
    }

    // Marquer présent
    const now = new Date();
    await attendee.update({
      status: "present",
      absence_reason: null,
      marked_at: now,
    });

    res.json({
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
      },
      attendee: {
        student_id: attendee.student_id,
        status: attendee.status,
        marked_at: attendee.marked_at,
        absence_reason: attendee.absence_reason,
      },
      already_present: false,
      message: `${student.first_name} ${student.last_name} marqué présent.`,
    });
  } catch (err) {
    next(err);
  }
};