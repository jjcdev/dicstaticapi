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
const { sanitizeLine } = require("../utils/sanitize");
const { ValidationError, trim } = require("../utils/validators");
const AppError = require("../utils/AppError");
const {
  isWorkshopOwnerOnly,
  isWorkshopManager,
} = require("../middlewares/rbac");
const {
  computeStudentAverage,
  computeAllAverages,
  FORMULA_VERSION,
  TYPES,
} = require("../utils/computeAverage");

const isSuperuserRole = (user) =>
  [ROLES.ADMIN, ROLES.PRESIDENT, ROLES.VICE_PRESIDENT].includes(user.role);

const assertOwnerOnly = async (user, workshopId) => {
  const workshop = await Workshop.findByPk(workshopId);
  if (!workshop) throw new AppError("Atelier introuvable.", 404);
  if (!isSuperuserRole(user) && !isWorkshopOwnerOnly(user, workshop)) {
    throw new AppError("Seul le chef du pôle peut effectuer cette action.", 403);
  }
  return workshop;
};

const assertManager = async (user, workshopId) => {
  const workshop = await Workshop.findByPk(workshopId);
  if (!workshop) throw new AppError("Atelier introuvable.", 404);
  if (!isSuperuserRole(user) && !isWorkshopManager(user, workshop)) {
    throw new AppError("Vous n'êtes pas responsable de cet atelier.", 403);
  }
  return workshop;
};

/**
 * Charge settings du pôle (ou crée avec défauts).
 */
const getOrCreateSettings = async (workshopId, updatedBy) => {
  let settings = await WorkshopSettings.findOne({
    where: { workshop_id: workshopId },
  });
  if (!settings) {
    settings = await WorkshopSettings.create({
      workshop_id: workshopId,
      devoir_weight: 50,
      examen_weight: 50,
      project_weight: 0,
      participation_weight: 0,
      sort_by: "name",
      sort_order: "asc",
      updated_by: updatedBy,
    });
  }
  return settings;
};

/* ═══════════════════════════════════════════════════════════
   Bordereau (lecture chef + adjoint)
   ═══════════════════════════════════════════════════════════ */

exports.getGradebook = async (req, res, next) => {
  try {
    const workshop = await assertManager(req.user, req.params.workshopId);

    const enrollments = await WorkshopStudent.findAll({
      where: { workshop_id: workshop.id, status: ENROLLMENT_STATUS.ACTIVE },
      include: [
        {
          model: User,
          as: "student",
          attributes: ["id", "first_name", "last_name", "email", "sexe"],
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

    const settings = await getOrCreateSettings(workshop.id, req.user.id);

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

exports.getAssessments = async (req, res, next) => {
  try {
    await assertManager(req.user, req.params.workshopId);
    const list = await Assessment.findAll({
      where: { workshop_id: req.params.workshopId },
      order: [["created_at", "ASC"]],
    });
    res.json(list);
  } catch (err) {
    next(err);
  }
};

/* ═══════════════════════════════════════════════════════════
   Assessments CRUD (chef SEUL)
   ═══════════════════════════════════════════════════════════ */

exports.createAssessment = async (req, res, next) => {
  try {
    await assertOwnerOnly(req.user, req.params.workshopId);
    const fields = {};
    const name = sanitizeLine(trim(req.body.name));
    if (!name || name.length < 2 || name.length > 120) {
      fields.name = "Nom requis (2 à 120 caractères).";
    }
    const allowedTypes = Object.values(ASSESSMENT_TYPE);
    const type = allowedTypes.includes(req.body.type)
      ? req.body.type
      : ASSESSMENT_TYPE.DEVOIR;
    const maxValue = parseFloat(req.body.max_value);
    if (!Number.isFinite(maxValue) || maxValue < 1)
      fields.max_value = "Note maximale ≥ 1.";
    const coefficient =
      req.body.coefficient !== undefined
        ? parseFloat(req.body.coefficient)
        : 1;
    if (!Number.isFinite(coefficient) || coefficient < 0.1)
      fields.coefficient = "Coefficient ≥ 0.1.";
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
    await assertOwnerOnly(req.user, a.workshop_id);

    const updates = {};
    if (req.body.name !== undefined) {
      const name = sanitizeLine(trim(req.body.name));
      if (!name || name.length < 2 || name.length > 120)
        return res.status(400).json({ message: "Nom invalide." });
      updates.name = name;
    }
    if (req.body.type !== undefined) {
      if (!Object.values(ASSESSMENT_TYPE).includes(req.body.type))
        return res.status(400).json({ message: "Type invalide." });
      updates.type = req.body.type;
    }
    if (req.body.max_value !== undefined) {
      const v = parseFloat(req.body.max_value);
      if (!Number.isFinite(v) || v < 1)
        return res.status(400).json({ message: "Note maximale ≥ 1." });
      updates.max_value = v;
    }
    if (req.body.coefficient !== undefined) {
      const v = parseFloat(req.body.coefficient);
      if (!Number.isFinite(v) || v < 0.1)
        return res.status(400).json({ message: "Coefficient ≥ 0.1." });
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
    await assertOwnerOnly(req.user, a.workshop_id);
    await a.destroy();
    res.json({ message: "Évaluation supprimée." });
  } catch (err) {
    next(err);
  }
};

/* ═══════════════════════════════════════════════════════════
   Notes — saisie individuelle (chef SEUL)
   ═══════════════════════════════════════════════════════════ */

exports.upsertGrade = async (req, res, next) => {
  try {
    const { assessmentId, studentId } = req.params;
    const a = await Assessment.findByPk(assessmentId);
    if (!a) return res.status(404).json({ message: "Évaluation introuvable." });
    await assertOwnerOnly(req.user, a.workshop_id);

    const raw = req.body.value;
    let value = null;
    if (raw !== null && raw !== undefined && raw !== "") {
      const num = parseFloat(raw);
      if (!Number.isFinite(num) || num < 0 || num > a.max_value) {
        return res
          .status(400)
          .json({ message: `Note doit être entre 0 et ${a.max_value}.` });
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

/* ═══════════════════════════════════════════════════════════
   Notes — saisie BULK (chef SEUL)
   ═══════════════════════════════════════════════════════════ */

exports.bulkUpsertGrades = async (req, res, next) => {
  try {
    const { assessmentId } = req.params;
    const a = await Assessment.findByPk(assessmentId);
    if (!a) return res.status(404).json({ message: "Évaluation introuvable." });
    await assertOwnerOnly(req.user, a.workshop_id);

    const entries = req.body.grades;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: "grades[] requis." });
    }
    if (entries.length > 100) {
      return res
        .status(400)
        .json({ message: "Maximum 100 entrées par appel." });
    }

    // Valider tous les student_ids avant écriture (évite les writes partiels)
    const studentIds = entries.map((e) => e.student_id).filter(Boolean);
    const existingStudents = await WorkshopStudent.findAll({
      where: {
        workshop_id: a.workshop_id,
        student_id: { [Op.in]: studentIds },
        status: ENROLLMENT_STATUS.ACTIVE,
      },
      attributes: ["student_id"],
    });
    const validStudentIds = new Set(existingStudents.map((e) => e.student_id));

    const results = {
      updated: 0,
      skipped: 0,
      errors: [],
      grades: [],
    };

    for (const entry of entries) {
      const studentId = entry.student_id;
      if (!studentId || !validStudentIds.has(studentId)) {
        results.skipped++;
        results.errors.push({
          student_id: studentId || null,
          reason: "Étudiant non actif dans ce pôle.",
        });
        continue;
      }

      // Parser la valeur
      const raw = entry.value;
      let value = null;
      if (raw !== null && raw !== undefined && raw !== "") {
        const num = parseFloat(raw);
        if (!Number.isFinite(num) || num < 0 || num > a.max_value) {
          results.skipped++;
          results.errors.push({
            student_id: studentId,
            reason: `Note doit être entre 0 et ${a.max_value}.`,
          });
          continue;
        }
        value = num;
      }

      try {
        const [grade, created] = await Grade.findOrCreate({
          where: { assessment_id: assessmentId, student_id: studentId },
          defaults: {
            value,
            comment: entry.comment || null,
            graded_by_id: req.user.id,
          },
        });
        if (!created) {
          await grade.update({
            value,
            comment: entry.comment || null,
            graded_by_id: req.user.id,
          });
        }
        results.updated++;
        results.grades.push({
          student_id: studentId,
          value,
          comment: entry.comment || null,
        });
      } catch (e) {
        results.skipped++;
        results.errors.push({
          student_id: studentId,
          reason: e.message,
        });
      }
    }

    res.json({
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors,
      grades: results.grades,
    });
  } catch (err) {
    next(err);
  }
};

/* ═══════════════════════════════════════════════════════════
   Moyennes calculées (chef + adjoint)
   ═══════════════════════════════════════════════════════════ */

exports.getComputedGradebook = async (req, res, next) => {
  try {
    const workshop = await assertManager(req.user, req.params.workshopId);

    const enrollments = await WorkshopStudent.findAll({
      where: { workshop_id: workshop.id, status: ENROLLMENT_STATUS.ACTIVE },
      include: [
        {
          model: User,
          as: "student",
          attributes: ["id", "first_name", "last_name"],
        },
      ],
    });
    const students = enrollments.map((e) => e.student).filter(Boolean);
    const studentIds = students.map((s) => s.id);

    if (studentIds.length === 0) {
      return res.json({
        students: [],
        settings: await getOrCreateSettings(workshop.id, req.user.id),
        formula_version: FORMULA_VERSION,
      });
    }

    const settings = await getOrCreateSettings(workshop.id, req.user.id);

    // Charger toutes les notes avec le type d'assessment
    const grades = await Grade.findAll({
      where: { student_id: { [Op.in]: studentIds } },
      include: [
        {
          model: Assessment,
          as: "assessment",
          where: { workshop_id: workshop.id },
          required: true,
          attributes: ["id", "type", "max_value", "coefficient"],
        },
      ],
    });

    // Grouper par étudiant
    const gradesByStudent = {};
    for (const g of grades) {
      if (!gradesByStudent[g.student_id]) gradesByStudent[g.student_id] = [];
      gradesByStudent[g.student_id].push({
        value: g.value,
        max_value: g.assessment.max_value,
        coefficient: g.assessment.coefficient,
        assessment_type: g.assessment.type,
      });
    }

    // Charger les bonus
    const bonuses = await StudentBonus.findAll({
      where: { workshop_id: workshop.id },
      attributes: ["student_id", "points"],
    });
    const bonusesByStudent = {};
    for (const b of bonuses) {
      if (!bonusesByStudent[b.student_id]) bonusesByStudent[b.student_id] = [];
      bonusesByStudent[b.student_id].push({ points: b.points });
    }

    // Initialiser les étudiants sans notes
    for (const s of students) {
      if (!gradesByStudent[s.id]) gradesByStudent[s.id] = [];
      if (!bonusesByStudent[s.id]) bonusesByStudent[s.id] = [];
    }

    const computed = computeAllAverages(
      gradesByStudent,
      bonusesByStudent,
      settings
    );

    const result = students.map((s) => ({
      student_id: s.id,
      student_name: `${s.first_name} ${s.last_name}`,
      ...computed[s.id],
    }));

    // Trier par rang (ceux avec rang d'abord, puis alphabétique)
    result.sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return a.student_name.localeCompare(b.student_name);
    });

    res.json({
      students: result,
      settings,
      formula_version: FORMULA_VERSION,
    });
  } catch (err) {
    next(err);
  }
};

/* ═══════════════════════════════════════════════════════════
   Paramètres + bonus (chef + adjoint)
   ═══════════════════════════════════════════════════════════ */

exports.updateSettings = async (req, res, next) => {
  try {
    await assertManager(req.user, req.params.workshopId);
    const fields = [
      "devoir_weight",
      "examen_weight",
      "project_weight",
      "participation_weight",
    ];
    const data = {};
    let sum = 0;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        const v = parseInt(req.body[f], 10);
        if (!Number.isInteger(v) || v < 0 || v > 100)
          return res
            .status(400)
            .json({ message: `${f} doit être entre 0 et 100.` });
        data[f] = v;
        sum += v;
      }
    }
    if (Object.keys(data).length === 4 && sum !== 100) {
      return res.status(400).json({
        message: `La somme des poids doit valoir 100 (actuel : ${sum}).`,
      });
    }
    if (req.body.sort_by !== undefined) {
      if (
        typeof req.body.sort_by !== "string" ||
        req.body.sort_by.length > 50
      )
        return res.status(400).json({ message: "sort_by invalide." });
      data.sort_by = req.body.sort_by;
    }
    if (req.body.sort_order !== undefined) {
      if (!["asc", "desc"].includes(req.body.sort_order))
        return res
          .status(400)
          .json({ message: "sort_order doit être 'asc' ou 'desc'." });
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

exports.addBonus = async (req, res, next) => {
  try {
    await assertManager(req.user, req.params.workshopId);

    const { student_id, stars, points, reason } = req.body;
    if (!student_id) return res.status(400).json({ message: "student_id requis." });

    // Stars : nullable, 1-5 si fourni
    let starsValue = null;
    if (stars !== undefined && stars !== null && stars !== "") {
      const s = parseInt(stars, 10);
      if (!Number.isInteger(s) || s < 1 || s > 5) {
        return res.status(400).json({ message: "Étoiles : entre 1 et 5." });
      }
      starsValue = s;
    }

    // Points : nullable, 0-20 si fourni (défaut 0)
    let pointsValue = 0;
    const pointsProvided = points !== undefined && points !== null && points !== "";
    if (pointsProvided) {
      const p = parseFloat(points);
      if (!Number.isFinite(p) || p < 0 || p > 20) {
        return res.status(400).json({ message: "Points : entre 0 et 20." });
      }
      pointsValue = p;
    }

    if (starsValue === null && !pointsProvided) {
      return res.status(400).json({
        message: "Fournissez au moins 'stars' ou 'points'.",
      });
    }

    const bonus = await StudentBonus.create({
      workshop_id: req.params.workshopId,
      student_id,
      stars: starsValue,
      points: pointsValue,
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
    await assertManager(req.user, b.workshop_id);
    await b.destroy();
    res.json({ message: "Bonus supprimé." });
  } catch (err) {
    next(err);
  }
};

/* ═══════════════════════════════════════════════════════════
   Mes notes (self) — enrichi avec computed
   ═══════════════════════════════════════════════════════════ */

exports.getMyGrades = async (req, res, next) => {
  try {
    const enrollments = await WorkshopStudent.findAll({
      where: { student_id: req.user.id, status: ENROLLMENT_STATUS.ACTIVE },
      include: [
        {
          model: Workshop,
          as: "workshop",
          attributes: ["id", "title", "type"],
        },
      ],
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
        attributes: ["id", "stars", "points", "reason", "createdAt"],
      });

      const settings = await getOrCreateSettings(workshop.id, req.user.id);

      // Calcul de la moyenne
      const gradesForCompute = grades.map((g) => ({
        value: g.value,
        max_value: g.assessment.max_value,
        coefficient: g.assessment.coefficient,
        assessment_type: g.assessment.type,
      }));
      const bonusesForCompute = bonuses.map((b) => ({ points: b.points }));
      const computed = computeStudentAverage(
        gradesForCompute,
        settings,
        bonusesForCompute
      );

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
        computed: {
          grades_by_type: computed.grades_by_type,
          base_average: computed.base_average,
          bonus_points: computed.bonus_points,
          total_points: computed.total_points,
          final_average: computed.final_average,
          has_grades: computed.has_grades,
        },
        settings: {
          devoir_weight: settings.devoir_weight,
          examen_weight: settings.examen_weight,
          project_weight: settings.project_weight,
          participation_weight: settings.participation_weight,
        },
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};