const {
  OrientationPreference,
  WorkshopTransferRequest,
  Workshop,
  WorkshopStudent,
  User,
  AcademicYear,
  sequelize,
} = require("../models");
const {
  ROLES,
  ORIENTATION_STATUS,
  ENROLLMENT_STATUS,
  SUPERUSER_ROLES,
} = require("../utils/constants");
const { sanitizeText } = require("../utils/sanitize");
const { push, NOTIF_TYPES } = require("../utils/notifications");
const AppError = require("../utils/AppError");
const { isWorkshopManager } = require("../middlewares/rbac");

const isSuperuser = (user) => SUPERUSER_ROLES.includes(user.role);
const isCoordinator = (user) => user.role === ROLES.COORDINATEUR_GENERAL;

/**
 * Peut recaler vers ce pôle :
 *  - superuser (admin/president/VP)
 *  - coordinateur général
 *  - chef/adjoint du pôle cible
 */
const canRecalibrate = (user, workshop) => {
  if (isSuperuser(user) || isCoordinator(user)) return true;
  if (!workshop) return false;
  return isWorkshopManager(user, workshop);
};

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function validateTargetedBody(body = {}) {
  const { student_ids, to_workshop_id } = body || {};
  if (
    !Array.isArray(student_ids) ||
    student_ids.length === 0 ||
    typeof to_workshop_id !== "string"
  ) {
    throw new AppError(
      "student_ids (tableau) et to_workshop_id requis.",
      400
    );
  }
  return { student_ids, to_workshop_id };
}

async function loadTargetWorkshop(id) {
  const target = await Workshop.findByPk(id);
  if (!target) throw new AppError("Pôle cible introuvable.", 404);
  if (target.status !== "active") throw new AppError("Ce pôle n'est pas actif.", 400);
  return target;
}

/**
 * Exécute un transfert "source → destination" dans une transaction.
 * `hooks: false` sur les updates car l'ordre est contrôlé manuellement
 * (source libérée AVANT destination activée). Le hook one-inscription
 * n'a pas à interférer.
 */
async function applyTransferInTransaction({
  t,
  student,
  fromWorkshopId,
  toWorkshopId,
  forcedBy,
  reason,
}) {
  // 1. Sortir de la source (si source)
  if (fromWorkshopId) {
    const current = await WorkshopStudent.findOne({
      where: {
        workshop_id: fromWorkshopId,
        student_id: student.id,
        status: ENROLLMENT_STATUS.ACTIVE,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (current) {
      await current.update(
        {
          status: ENROLLMENT_STATUS.TRANSFERRED_OUT,
          dropped_at: new Date(),
        },
        { transaction: t, hooks: false }
      );
    }
  }

  // 2. Entrer dans la destination
  const year = await AcademicYear.findOne({
    where: { is_current: true },
    transaction: t,
  });

  const dest = await WorkshopStudent.findOne({
    where: { workshop_id: toWorkshopId, student_id: student.id },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (dest) {
    await dest.update(
      {
        status: ENROLLMENT_STATUS.ACTIVE,
        joined_at: new Date(),
        dropped_at: null,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
        academic_year_id: dest.academic_year_id || (year ? year.id : null),
      },
      { transaction: t, hooks: false }
    );
  } else {
    await WorkshopStudent.create(
      {
        workshop_id: toWorkshopId,
        student_id: student.id,
        status: ENROLLMENT_STATUS.ACTIVE,
        academic_year_id: year ? year.id : null,
        joined_at: new Date(),
      },
      { transaction: t, hooks: false }
    );
  }

  // 3. Créer un transfert approuvé pour la trace
  return await WorkshopTransferRequest.create(
    {
      student_id: student.id,
      from_workshop_id: fromWorkshopId || null,
      to_workshop_id: toWorkshopId,
      status: "approved",
      forced_by: forcedBy,
      forced_at: new Date(),
      force_reason: reason,
    },
    { transaction: t }
  );
}

/* ═══════════════════════════════════════════════════════════
   POST /recalibrate/bulk
   Recalage en masse basé sur les OrientationPreference PENDING.
   ═══════════════════════════════════════════════════════════ */

exports.bulkRecalibrate = async (req, res, next) => {
  try {
    const { workshop_id, reason, dry_run } = req.body || {};
    const isDryRun = dry_run === true;

    const where = { status: ORIENTATION_STATUS.PENDING };
    if (typeof workshop_id === "string" && workshop_id) {
      where.target_workshop_id = workshop_id;
    }

    const preferences = await OrientationPreference.findAll({
      where,
      include: [
        { model: Workshop, as: "target_workshop" },
        { model: User, as: "student", attributes: ["id", "first_name", "last_name"] },
      ],
    });

    // Chef : ne peut recaler que vers ses propres pôles
    if (!isSuperuser(req.user) && !isCoordinator(req.user)) {
      const targetIds = [...new Set(preferences.map((p) => p.target_workshop_id))];
      for (const tid of targetIds) {
        const w = await Workshop.findByPk(tid);
        if (!canRecalibrate(req.user, w)) {
          return res.status(403).json({
            message: "Vous ne pouvez recaler que vers vos propres pôles.",
          });
        }
      }
    }

    if (preferences.length === 0) {
      return res.json({
        message: "Aucune préférence en attente à recaler.",
        processed: 0,
        skipped: 0,
        errors: [],
        preview: [],
      });
    }

    const results = { processed: 0, skipped: 0, errors: [] };

    /* ─── Dry run : simulation + preview ─── */
    if (isDryRun) {
      const preview = [];
      for (const pref of preferences) {
        const student = await User.findByPk(pref.student_id);
        if (!student) {
          results.errors.push({ preference_id: pref.id, reason: "Étudiant introuvable" });
          continue;
        }
        const enrollment = await WorkshopStudent.findOne({
          where: { student_id: pref.student_id, status: ENROLLMENT_STATUS.ACTIVE },
          include: [{ model: Workshop, as: "workshop", attributes: ["id", "title"] }],
        });
        const currentWorkshopId = enrollment ? enrollment.workshop_id : null;
        if (currentWorkshopId === pref.target_workshop_id) {
          results.skipped++;
          continue;
        }
        results.processed++;
        preview.push({
          preference_id: pref.id,
          student_id: student.id,
          student_name: `${student.first_name} ${student.last_name}`,
          from_workshop_id: currentWorkshopId,
          from_workshop_title: enrollment?.workshop?.title || null,
          to_workshop_id: pref.target_workshop_id,
          to_workshop_title: pref.target_workshop?.title || null,
        });
      }
      return res.json({
        message: "Simulation terminée (dry_run).",
        ...results,
        total_preferences: preferences.length,
        preview,
      });
    }

    /* ─── Exécution réelle ─── */
    const reasonText = reason
      ? sanitizeText(String(reason)).slice(0, 2000)
      : "Recalage administratif";

    for (const pref of preferences) {
      try {
        await sequelize.transaction(async (t) => {
          const student = await User.findByPk(pref.student_id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!student) throw new AppError("Étudiant introuvable.", 404);

          const current = await WorkshopStudent.findOne({
            where: { student_id: student.id, status: ENROLLMENT_STATUS.ACTIVE },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          const fromWorkshopId = current ? current.workshop_id : null;

          if (fromWorkshopId === pref.target_workshop_id) {
            // Déjà dans le pôle cible → juste marquer fulfilled
            await pref.update(
              {
                status: ORIENTATION_STATUS.FULFILLED,
                decided_by: req.user.id,
                decided_at: new Date(),
              },
              { transaction: t }
            );
            results.skipped++;
            return;
          }

          await applyTransferInTransaction({
            t,
            student,
            fromWorkshopId,
            toWorkshopId: pref.target_workshop_id,
            forcedBy: req.user.id,
            reason: reasonText,
          });

          await pref.update(
            {
              status: ORIENTATION_STATUS.FULFILLED,
              decided_by: req.user.id,
              decided_at: new Date(),
            },
            { transaction: t }
          );

          results.processed++;
        });

        push(pref.student_id, NOTIF_TYPES.ORIENTATION_FULFILLED, {
          orientation_id: pref.id,
          target_workshop_title: pref.target_workshop?.title || "Pôle",
          reason: reasonText,
        });
      } catch (err) {
        results.errors.push({
          preference_id: pref.id,
          student_id: pref.student_id,
          reason: err.message,
        });
      }
    }

    res.json({
      message: `Recalage terminé : ${results.processed} étudiant(s) recalé(s).`,
      ...results,
      total_preferences: preferences.length,
    });
  } catch (err) {
    next(err);
  }
};

/* ═══════════════════════════════════════════════════════════
   POST /recalibrate/targeted/preview
   Simulation du recalage ciblé (aucune écriture).
   ═══════════════════════════════════════════════════════════ */

exports.targetedRecalibratePreview = async (req, res, next) => {
  try {
    const { student_ids, to_workshop_id } = validateTargetedBody(req.body);
    const target = await loadTargetWorkshop(to_workshop_id);

    if (!canRecalibrate(req.user, target)) {
      return res.status(403).json({
        message: "Vous ne pouvez recaler que vers vos propres pôles.",
      });
    }

    const preview = [];
    const errors = [];
    let processed = 0;
    let skipped = 0;

    for (const studentId of student_ids) {
      const student = await User.findByPk(studentId);
      if (!student || student.role !== ROLES.STUDENT) {
        errors.push({ student_id: studentId, reason: "Étudiant invalide." });
        continue;
      }

      const enrollment = await WorkshopStudent.findOne({
        where: { student_id: student.id, status: ENROLLMENT_STATUS.ACTIVE },
        include: [{ model: Workshop, as: "workshop", attributes: ["id", "title"] }],
      });

      const fromWorkshopId = enrollment ? enrollment.workshop_id : null;

      if (fromWorkshopId === to_workshop_id) {
        skipped++;
        continue;
      }

      processed++;
      preview.push({
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`,
        from_workshop_id: fromWorkshopId,
        from_workshop_title: enrollment?.workshop?.title || null,
        to_workshop_id,
        to_workshop_title: target.title,
      });
    }

    res.json({
      message: "Simulation terminée (targeted preview).",
      would_process: processed,
      would_skip: skipped,
      total_requested: student_ids.length,
      errors,
      preview,
    });
  } catch (err) {
    next(err);
  }
};

/* ═══════════════════════════════════════════════════════════
   POST /recalibrate/targeted
   Recalage ciblé : liste explicite d'étudiants → un pôle.
   ═══════════════════════════════════════════════════════════ */

exports.targetedRecalibrate = async (req, res, next) => {
  try {
    const { student_ids, to_workshop_id, reason } = req.body || {};
    const { student_ids: ids } = validateTargetedBody({
      student_ids,
      to_workshop_id,
    });
    const target = await loadTargetWorkshop(to_workshop_id);

    if (!canRecalibrate(req.user, target)) {
      return res.status(403).json({
        message: "Vous ne pouvez recaler que vers vos propres pôles.",
      });
    }

    const reasonText = reason
      ? sanitizeText(String(reason)).slice(0, 2000)
      : "Recalage administratif ciblé";

    const results = { processed: 0, skipped: 0, errors: [] };

    for (const studentId of ids) {
      try {
        await sequelize.transaction(async (t) => {
          const student = await User.findByPk(studentId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!student || student.role !== ROLES.STUDENT) {
            throw new AppError("Étudiant invalide.", 400);
          }

          const current = await WorkshopStudent.findOne({
            where: { student_id: student.id, status: ENROLLMENT_STATUS.ACTIVE },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          if (current && current.workshop_id === to_workshop_id) {
            results.skipped++;
            return;
          }

          await applyTransferInTransaction({
            t,
            student,
            fromWorkshopId: current ? current.workshop_id : null,
            toWorkshopId: to_workshop_id,
            forcedBy: req.user.id,
            reason: reasonText,
          });

          // Marquer les préférences pending vers ce pôle comme fulfilled
          await OrientationPreference.update(
            {
              status: ORIENTATION_STATUS.FULFILLED,
              decided_by: req.user.id,
              decided_at: new Date(),
            },
            {
              where: {
                student_id: student.id,
                target_workshop_id: to_workshop_id,
                status: ORIENTATION_STATUS.PENDING,
              },
              transaction: t,
            }
          );

          results.processed++;
        });

        push(studentId, NOTIF_TYPES.RECALIBRATION_BULK_DONE, {
          to_workshop_title: target.title,
          reason: reasonText,
        });
      } catch (err) {
        results.errors.push({ student_id: studentId, reason: err.message });
      }
    }

    res.json({
      message: `Recalage ciblé terminé : ${results.processed} étudiant(s) traité(s).`,
      ...results,
    });
  } catch (err) {
    next(err);
  }
};