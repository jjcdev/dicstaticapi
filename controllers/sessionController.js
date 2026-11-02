const {
  Session,
  Workshop,
  WorkshopStudent,
  SessionEnrollment,
  Attendance,
  User,
} = require("../models");
const { ENROLLMENT_STATUS, ROLES } = require("../utils/constants");
const { sanitizeText, sanitizeLine } = require("../utils/sanitize");
const { ValidationError, trim, isValidDate } = require("../utils/validators");
const AppError = require("../utils/AppError");

const canManage = (user, workshop) =>
  user.role === ROLES.ADMIN ||
  user.id === workshop.instructor_id ||
  user.id === workshop.co_instructor_id;

const validateSessionPayload = (body, { partial = false } = {}) => {
  const fields = {};
  const data = {};

  if (body.title !== undefined || !partial) {
    const title = sanitizeLine(trim(body.title));
    if (!title || title.length > 200) {
      fields.title = "Titre requis (max 200 caractères).";
    } else {
      data.title = title;
    }
  }

  if (body.date !== undefined || !partial) {
    if (!isValidDate(body.date)) {
      fields.date = "Date invalide (YYYY-MM-DD).";
    } else {
      data.date = body.date;
    }
  }

  if (body.description !== undefined) {
    if (body.description === null || body.description === "") {
      data.description = null;
    } else {
      const d = sanitizeText(String(body.description));
      if (d.length > 5000) {
        fields.description = "Description trop longue (max 5000).";
      } else {
        data.description = d || null;
      }
    }
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
};

/* ─────────── Liste des séances d'un atelier ─────────── */

exports.getSessions = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.workshopId);
    if (!workshop) {
      return res.status(404).json({ message: "Atelier introuvable." });
    }

    const sessions = await Session.findAll({
      where: { workshop_id: workshop.id },
      include: [
        {
          model: SessionEnrollment,
          as: "enrollments",
          attributes: ["id", "student_id"],
          required: false,
        },
        {
          model: Attendance,
          as: "attendances",
          attributes: ["id", "student_id", "status"],
          required: false,
        },
      ],
      order: [
        ["date", "DESC"],
        ["created_at", "DESC"],
      ],
    });

    const stats = sessions.map((s) => {
      const total = s.enrollments?.length || 0;
      const att = s.attendances || [];
      const present = att.filter((a) => a.status === "present").length;
      const late = att.filter((a) => a.status === "late").length;
      const absent = att.filter((a) => a.status === "absent").length;
      const excused = att.filter((a) => a.status === "excused").length;
      return {
        id: s.id,
        title: s.title,
        date: s.date,
        session_number: s.session_number,
        description: s.description,
        created_at: s.created_at,
        total_students: total,
        present,
        late,
        absent,
        excused,
        attendance_rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      };
    });

    res.json(stats);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Détail d'une séance avec étudiants ─────────── */

exports.getSession = async (req, res, next) => {
  try {
    const session = await Session.findByPk(req.params.id, {
      include: [
        {
          model: SessionEnrollment,
          as: "enrollments",
          include: [
            {
              model: User,
              as: "student",
              attributes: ["id", "first_name", "last_name", "email"],
            },
          ],
        },
        { model: Attendance, as: "attendances", required: false },
        { model: Workshop, as: "workshop", attributes: ["id", "title"] },
      ],
    });
    if (!session) {
      return res.status(404).json({ message: "Séance introuvable." });
    }

    const attendanceMap = new Map();
    (session.attendances || []).forEach((a) => attendanceMap.set(a.student_id, a));

    const students = (session.enrollments || []).map((e) => {
      const a = attendanceMap.get(e.student_id);
      return {
        id: e.student_id,
        first_name: e.student?.first_name,
        last_name: e.student?.last_name,
        email: e.student?.email,
        enrolled_at: e.enrolled_at,
        status: a ? a.status : "absent",
        attendance_id: a ? a.id : null,
        remarks: a ? a.remarks : null,
      };
    });

    res.json({
      session: {
        id: session.id,
        title: session.title,
        date: session.date,
        session_number: session.session_number,
        description: session.description,
        workshop: session.workshop,
      },
      students,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Créer une séance (avec snapshot) ─────────── */

exports.createSession = async (req, res, next) => {
  try {
    const workshop = await Workshop.findByPk(req.params.workshopId);
    if (!workshop) {
      return res.status(404).json({ message: "Atelier introuvable." });
    }
    if (!canManage(req.user, workshop)) {
      return res.status(403).json({ message: "Vous n'êtes pas responsable de cet atelier." });
    }

    const data = validateSessionPayload(req.body);

    const count = await Session.count({ where: { workshop_id: workshop.id } });
    const session_number = count + 1;

    const session = await Session.create({
      workshop_id: workshop.id,
      title: data.title || `Séance ${session_number}`,
      date: data.date,
      description: data.description || null,
      session_number,
      created_by: req.user.id,
    });

    // Snapshot : étudiants actifs au moment de la création
    const activeEnrollments = await WorkshopStudent.findAll({
      where: { workshop_id: workshop.id, status: ENROLLMENT_STATUS.ACTIVE },
    });
    if (activeEnrollments.length > 0) {
      await SessionEnrollment.bulkCreate(
        activeEnrollments.map((e) => ({
          session_id: session.id,
          student_id: e.student_id,
          enrolled_at: e.joined_at,
        }))
      );
    }

    res.status(201).json({
      message: `Séance créée avec ${activeEnrollments.length} étudiant(s).`,
      session,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Mettre à jour une séance ─────────── */

exports.updateSession = async (req, res, next) => {
  try {
    const session = await Session.findByPk(req.params.id);
    if (!session) {
      return res.status(404).json({ message: "Séance introuvable." });
    }
    const workshop = await Workshop.findByPk(session.workshop_id);
    if (!workshop || !canManage(req.user, workshop)) {
      return res.status(403).json({ message: "Vous n'êtes pas responsable de cet atelier." });
    }

    const data = validateSessionPayload(req.body, { partial: true });
    await session.update(data);
    res.json(session);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Supprimer une séance ─────────── */

exports.deleteSession = async (req, res, next) => {
  try {
    const session = await Session.findByPk(req.params.id);
    if (!session) {
      return res.status(404).json({ message: "Séance introuvable." });
    }
    const workshop = await Workshop.findByPk(session.workshop_id);
    if (!workshop || !canManage(req.user, workshop)) {
      return res.status(403).json({ message: "Vous n'êtes pas responsable de cet atelier." });
    }
    await session.destroy();
    res.json({ message: "Séance supprimée." });
  } catch (err) {
    next(err);
  }
};