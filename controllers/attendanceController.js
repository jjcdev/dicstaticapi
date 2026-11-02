const {
  Attendance,
  Session,
  User,
  Workshop,
  WorkshopStudent,
  SessionEnrollment,
} = require("../models");
const { ATTENDANCE_STATUS, ROLES } = require("../utils/constants");
const AppError = require("../utils/AppError");

const canManage = (user, workshop) =>
  user.role === ROLES.ADMIN ||
  user.id === workshop.instructor_id ||
  user.id === workshop.co_instructor_id;

const VALID_STATUSES = Object.values(ATTENDANCE_STATUS);

/* ─────────── Tableau complet des présences d'un atelier ─────────── */

exports.getWorkshopAttendances = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.workshopId);
    if (!workshop) {
      return res.status(404).json({ message: "Atelier introuvable." });
    }
    if (!canManage(req.user, workshop)) {
      return res.status(403).json({ message: "Accès réservé au responsable." });
    }

    const students = await User.findAll({
      attributes: ["id", "first_name", "last_name", "email"],
      include: [
        {
          model: WorkshopStudent,
          as: "enrollments",
          where: { workshop_id: workshop.id, status: "active" },
          required: true,
          attributes: [],
        },
      ],
    });

    const sessions = await Session.findAll({
      where: { workshop_id: workshop.id },
      include: [
        {
          model: Attendance,
          as: "attendances",
          required: false,
        },
      ],
      order: [["date", "DESC"]],
    });

    const formatted = sessions.map((s) => {
      const map = new Map();
      (s.attendances || []).forEach((a) => map.set(a.student_id, a));
      const rows = students.map((st) => {
        const a = map.get(st.id);
        return {
          student_id: st.id,
          first_name: st.first_name,
          last_name: st.last_name,
          email: st.email,
          status: a ? a.status : "absent",
          attendance_id: a ? a.id : null,
          remarks: a ? a.remarks : null,
        };
      });
      return {
        session: {
          id: s.id,
          title: s.title,
          date: s.date,
          session_number: s.session_number,
        },
        attendances: rows,
      };
    });

    res.json({
      workshop: { id: workshop.id, title: workshop.title, student_count: students.length },
      sessions: formatted,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mes présences (étudiant) ─────────── */

exports.getMyAttendance = async (req, res, next) => {
  try {
    const attendances = await Attendance.findAll({
      where: { student_id: req.user.id },
      include: [
        {
          model: Session,
          as: "session",
          attributes: ["id", "date", "title"],
          include: [{ model: Workshop, as: "workshop", attributes: ["id", "title"] }],
        },
      ],
      order: [[{ model: Session, as: "session" }, "date", "DESC"]],
    });

    const total = attendances.length;
    const present = attendances.filter(
      (a) => a.status === ATTENDANCE_STATUS.PRESENT || a.status === ATTENDANCE_STATUS.LATE
    ).length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    res.json({ attendances, stats: { total, present, rate } });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Marquage individuel ─────────── */

exports.markAttendance = async (req, res, next) => {
  try {
    const { sessionId, studentId } = req.params;
    const { status, remarks } = req.body;

    const session = await Session.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Séance introuvable." });
    }
    const workshop = await Workshop.findByPk(session.workshop_id);
    if (!workshop || !canManage(req.user, workshop)) {
      return res.status(403).json({ message: "Accès réservé au responsable." });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Statut invalide (${VALID_STATUSES.join(", ")}).` });
    }

    const [record] = await Attendance.findOrCreate({
      where: { session_id: sessionId, student_id: studentId },
      defaults: {
        status,
        remarks: remarks || null,
        marked_by_id: req.user.id,
      },
    });
    if (!record.isNewRecord) {
      await record.update({
        status,
        remarks: remarks || null,
        marked_by_id: req.user.id,
      });
    }
    res.json(record);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Marquage en masse ─────────── */

exports.markBulkAttendance = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { attendances } = req.body;

    if (!Array.isArray(attendances)) {
      return res.status(400).json({ message: "Tableau 'attendances' requis." });
    }

    const session = await Session.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({ message: "Séance introuvable." });
    }
    const workshop = await Workshop.findByPk(session.workshop_id);
    if (!workshop || !canManage(req.user, workshop)) {
      return res.status(403).json({ message: "Accès réservé au responsable." });
    }

    // Valider les IDs étudiants (doivent être inscrits à la séance via snapshot)
    const validEnrollments = await SessionEnrollment.findAll({
      where: { session_id: sessionId },
      attributes: ["student_id"],
    });
    const validStudentIds = new Set(validEnrollments.map((e) => e.student_id));

    const results = [];
    for (const att of attendances) {
      if (!att.student_id || !validStudentIds.has(att.student_id)) continue;
      if (!VALID_STATUSES.includes(att.status)) {
        return res.status(400).json({
          message: `Statut invalide pour ${att.student_id}.`,
        });
      }
      const [record, created] = await Attendance.findOrCreate({
        where: { session_id: sessionId, student_id: att.student_id },
        defaults: {
          status: att.status,
          remarks: att.remarks || null,
          marked_by_id: req.user.id,
        },
      });
      if (!created) {
        await record.update({
          status: att.status,
          remarks: att.remarks || null,
          marked_by_id: req.user.id,
        });
      }
      results.push(record);
    }

    res.json({
      message: `${results.length} présence(s) enregistrée(s).`,
      attendances: results,
    });
  } catch (err) {
    next(err);
  }
};