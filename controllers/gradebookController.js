const {
  Assessment,
  Grade,
  Workshop,
  User,
  WorkshopStudent,
  WorkshopSettings,
  StudentBonus,
} = require("../models");
const { Op } = require("sequelize");
const {
  ASSESSMENT_TYPE,
  ENROLLMENT_STATUS,
  ROLES,
} = require("../utils/constants");
const { sanitizeLine, sanitizeText } = require("../utils/sanitize");
const { ValidationError, trim } = require("../utils/validators");
const AppError = require("../utils/AppError");

const canManage = (user, workshop) =>
  user.role === ROLES.ADMIN ||
  user.id === workshop.instructor_id ||
  user.id === workshop.co_instructor_id;

const assertWorkshopOwner = async (user, workshopId) => {
  const workshop = await Workshop.findByPk(workshopId);
  if (!workshop) throw new AppError("Atelier introuvable.", 404);
  if (!canManage(user, workshop)) {
    throw new AppError("Vous n'êtes pas responsable de cet atelier.", 403);
  }
  return workshop;
};

/* ─────────── Bordereau complet ─────────── */

exports.getGradebook = async (req, res, next) => {
  try {
    const workshop = await assertWorkshopOwner(req.user, req.params.workshopId);

    const enrollments = await WorkshopStudent.findAll({
      where: { workshop_id: workshop.id, status: ENROLLMENT_STATUS.ACTIVE },
      include: [
        {
          model: User,
          as: "student",
          attributes: ["id", "first_name", "last_name", "email"],
        },
      ],
    });
    const students = enrollments.map((e) => e.student).filter(Boolean);

    const assessments = await Assessment.findAll({
      where: { workshop_id: workshop.id },
      order: [["created_at", "ASC"]],
    });

    const assessmentIds = assessments.map((a) => a.id);
    const studentIds = students.map((s) => s.id);

    const grades =
      assessmentIds.length && studentIds.length
        ? await Grade.findAll({
            where: {
              assessment_id: { [Op.in]: assessmentIds },
              student_id: { [Op.in]: studentIds },
            },
          })
        : [];

    const gradesMap = {};
    grades.forEach((g) => {
      if (!gradesMap[g.student_id]) gradesMap[g.student_id] = {};
      gradesMap[g.student_id][g.assessment_id] = g.value;
    });

    let settings = await WorkshopSettings.findOne({
      where: { workshop_id: workshop.id },
    });
    if (!settings) {
      settings = await WorkshopSettings.create({
        workshop_id: workshop.id,
        devoir_weight: 50,
        examen_weight: 50,
        project_weight: 0,
        participation_weight: 0,
        sort_by: "name",
        sort_order: "asc",
        updated_by: req.user.id,
      });
    }

    const bonuses = await StudentBonus.findAll({
      where: { workshop_id: workshop.id },
      order: [["created_at", "DESC"]],
    });
    const bonusesMap = {};
    bonuses.forEach((b) => {
      if (!bonusesMap[b.student_id]) bonusesMap[b.student_id] = [];
      bonusesMap[b.student_id].push(b);
    });

    res.json({
      students,
      assessments,
      grades: gradesMap,
      settings,
      bonuses: bonusesMap,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Assessment CRUD ─────────── */

exports.getAssessments = async (req, res, next) => {
  try {
    await assertWorkshopOwner(req.user, req.params.workshopId);
    const list = await Assessment.findAll({
      where: { workshop_id: req.params.workshopId },
      order: [["created_at", "ASC"]],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
};

exports.createAssessment = async (req, res, next) => {
  try {
    await assertWorkshopOwner(req.user, req.params.workshopId);
    const fields = {};
    const name = sanitizeLine(trim(req.body.name));
    if (!name || name.length < 2 || name.length > 120) {
      fields.name = "Nom requis (2 à 120 caractères).";
    }
    const allowedTypes = Object.values(ASSESSMENT_TYPE);
    const type = allowedTypes.includes(req.body.type) ? req.body.type : ASSESSMENT_TYPE.DEVOIR;
    const maxValue = parseFloat(req.body.max_value);
    if (!Number.isFinite(maxValue) || maxValue < 1) {
      fields.max_value = "Note maximale ≥ 1.";
    }
    const coefficient = req.body.coefficient !== undefined ? parseFloat(req.body.coefficient) : 1;
    if (!Number.isFinite(coefficient) || coefficient < 0.1) {
      fields.coefficient = "Coefficient ≥ 0.1.";
    }
    if (Object.keys(fields).length) throw new ValidationError(fields);

    const a = await Assessment.create({
      workshop_id: req.params.workshopId,
      name,
      type,
      max_value: maxValue,
      coefficient,
      created_by: req.user.id,
    });
    res.status(201).json(a);
  } catch (err) {
    next(err);
  }
};

exports.updateAssessment = async (req, res, next) => {
  try {
    const a = await Assessment.findByPk(req.params.id);
    if (!a) return res.status(404).json({ message: "Évaluation introuvable." });
    await assertWorkshopOwner(req.user, a.workshop_id);

    const updates = {};
    if (req.body.name !== undefined) {
      const name = sanitizeLine(trim(req.body.name));
      if (!name || name.length < 2 || name.length > 120) {
        return res.status(400).json({ message: "Nom invalide." });
      }
      updates.name = name;
    }
    if (req.body.type !== undefined) {
      if (!Object.values(ASSESSMENT_TYPE).includes(req.body.type)) {
        return res.status(400).json({ message: "Type invalide." });
      }
      updates.type = req.body.type;
    }
    if (req.body.max_value !== undefined) {
      const v = parseFloat(req.body.max_value);
      if (!Number.isFinite(v) || v < 1) {
        return res.status(400).json({ message: "Note maximale ≥ 1." });
      }
      updates.max_value = v;
    }
    if (req.body.coefficient !== undefined) {
      const v = parseFloat(req.body.coefficient);
      if (!Number.isFinite(v) || v < 0.1) {
        return res.status(400).json({ message: "Coefficient ≥ 0.1." });
      }
      updates.coefficient = v;
    }

    await a.update(updates);
    res.json(a);
  } catch (err) {
    next(err);
  }
};

exports.deleteAssessment = async (req, res, next) => {
  try {
    const a = await Assessment.findByPk(req.params.id);
    if (!a) return res.status(404).json({ message: "Évaluation introuvable." });
    await assertWorkshopOwner(req.user, a.workshop_id);
    await a.destroy();
    res.json({ message: "Évaluation supprimée." });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Upsert une note ─────────── */

exports.upsertGrade = async (req, res, next) => {
  try {
    const { assessmentId, studentId } = req.params;
    const a = await Assessment.findByPk(assessmentId);
    if (!a) return res.status(404).json({ message: "Évaluation introuvable." });
    await assertWorkshopOwner(req.user, a.workshop_id);

    const raw = req.body.value;
    let value = null;
    if (raw !== null && raw !== undefined && raw !== "") {
      const num = parseFloat(raw);
      if (!Number.isFinite(num) || num < 0 || num > a.max_value) {
        return res.status(400).json({
          message: `Note doit être entre 0 et ${a.max_value}.`,
        });
      }
      value = num;
    }

    const [grade, created] = await Grade.findOrCreate({
      where: { assessment_id: assessmentId, student_id: studentId },
      defaults: {
        value,
        comment: req.body.comment || null,
        graded_by_id: req.user.id,
      },
    });
    if (!created) {
      await grade.update({
        value,
        comment: req.body.comment || null,
        graded_by_id: req.user.id,
      });
    }
    res.json(grade);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Paramètres de pondération ─────────── */

exports.updateSettings = async (req, res, next) => {
  try {
    await assertWorkshopOwner(req.user, req.params.workshopId);

    const fields = ["devoir_weight", "examen_weight", "project_weight", "participation_weight"];
    const data = {};
    let sum = 0;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        const v = parseInt(req.body[f], 10);
        if (!Number.isInteger(v) || v < 0 || v > 100) {
          return res.status(400).json({ message: `${f} doit être entre 0 et 100.` });
        }
        data[f] = v;
        sum += v;
      }
    }
    // Somme des poids présents
    if (Object.keys(data).length === 4 && sum !== 100) {
      return res.status(400).json({
        message: `La somme des poids doit valoir 100 (actuel : ${sum}).`,
      });
    }

    if (req.body.sort_by !== undefined) {
      if (typeof req.body.sort_by !== "string" || req.body.sort_by.length > 50) {
        return res.status(400).json({ message: "sort_by invalide." });
      }
      data.sort_by = req.body.sort_by;
    }
    if (req.body.sort_order !== undefined) {
      if (!["asc", "desc"].includes(req.body.sort_order)) {
        return res.status(400).json({ message: "sort_order doit être 'asc' ou 'desc'." });
      }
      data.sort_order = req.body.sort_order;
    }

    const [settings] = await WorkshopSettings.findOrCreate({
      where: { workshop_id: req.params.workshopId },
      defaults: { ...data, updated_by: req.user.id },
    });
    if (Object.keys(data).length) {
      await settings.update({ ...data, updated_by: req.user.id });
    }
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Bonus ─────────── */

exports.addBonus = async (req, res, next) => {
  try {
    await assertWorkshopOwner(req.user, req.params.workshopId);

    const { student_id, stars, reason } = req.body;
    if (!student_id) return res.status(400).json({ message: "student_id requis." });
    const s = parseInt(stars, 10);
    if (!Number.isInteger(s) || s < 1 || s > 5) {
      return res.status(400).json({ message: "Étoiles : entre 1 et 5." });
    }

    const bonus = await StudentBonus.create({
      workshop_id: req.params.workshopId,
      student_id,
      stars: s,
      reason: reason ? sanitizeLine(reason).slice(0, 255) : null,
      awarded_by: req.user.id,
    });
    res.status(201).json(bonus);
  } catch (err) {
    next(err);
  }
};

exports.deleteBonus = async (req, res, next) => {
  try {
    const b = await StudentBonus.findByPk(req.params.id);
    if (!b) return res.status(404).json({ message: "Bonus introuvable." });
    await assertWorkshopOwner(req.user, b.workshop_id);
    await b.destroy();
    res.json({ message: "Bonus supprimé." });
  } catch (err) {
    next(err);
  }
};
// controllers/gradebookController.js — ajouter
exports.getMyGrades = async (req, res, next) => {
  try {
    const { Grade, Assessment, Workshop, WorkshopStudent, StudentBonus } = require("../models");
    const { ENROLLMENT_STATUS } = require("../utils/constants");

    const enrollments = await WorkshopStudent.findAll({
      where: { student_id: req.user.id, status: ENROLLMENT_STATUS.ACTIVE },
      include: [{ model: Workshop, as: "workshop", attributes: ["id", "title", "type"] }],
    });

    const result = [];
    for (const enrollment of enrollments) {
      const workshop = enrollment.workshop;
      if (!workshop) continue;

      const grades = await Grade.findAll({
        where: { student_id: req.user.id },
        include: [
          {
            model: Assessment,
            as: "assessment",
            where: { workshop_id: workshop.id },
            required: true,
            attributes: ["id", "name", "type", "max_value", "coefficient"],
          },
        ],
      });

      const bonuses = await StudentBonus.findAll({
        where: { workshop_id: workshop.id, student_id: req.user.id },
        attributes: ["id", "stars", "reason", "createdAt"],
      });

      result.push({
        workshop,
        grades: grades.map((g) => ({
          assessment_id: g.assessment_id,
          assessment_name: g.assessment.name,
          assessment_type: g.assessment.type,
          value: g.value,
          max_value: g.assessment.max_value,
          coefficient: g.assessment.coefficient,
          comment: g.comment,
        })),
        bonuses,
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};