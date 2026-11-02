const { Op } = require("sequelize");
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
} = require("../utils/constants");
const { sanitizeText } = require("../utils/sanitize");
const { push, NOTIF_TYPES } = require("../utils/notifications");
const AppError = require("../utils/AppError");

const isSuperuser = (user) =>
  [ROLES.ADMIN, ROLES.PRESIDENT].includes(user.role);

/**
 * Recalage en masse : prend toutes les OrientationPreference PENDING
 * (optionnellement filtrées), crée les WorkshopTransferRequest en mode
 * "forced", exécute les transferts et marque les preferences FULFILLED.
 *
 * Requête type :
 *   POST /api/recalibrate/bulk
 *   Body :
 *     { workshop_id?: "uuid",    // optionnel : uniquement les préférences vers ce pôle
 *       reason?: "string",       // texte ajouté en notification
 *       dry_run?: boolean }      // simule sans écrire
 */
exports.bulkRecalibrate = async (req, res, next) => {
  try {
    if (!isSuperuser(req.user)) {
      return res.status(403).json({
        message: "Réservé au président ou à l'administrateur.",
      });
    }

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

    if (preferences.length === 0) {
      return res.json({
        message: "Aucune préférence en attente à recaler.",
        processed: 0,
        skipped: 0,
        errors: [],
      });
    }

    const results = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    // Dry run : on calcule sans écrire
    if (isDryRun) {
      for (const pref of preferences) {
        const student = await User.findByPk(pref.student_id);
        if (!student) {
          results.errors.push({
            preference_id: pref.id,
            reason: "Étudiant introuvable",
          });
          continue;
        }
        const enrollment = await WorkshopStudent.findOne({
          where: {
            student_id: pref.student_id,
            status: ENROLLMENT_STATUS.ACTIVE,
          },
        });
        const currentWorkshopId = enrollment ? enrollment.workshop_id : null;
        if (currentWorkshopId === pref.target_workshop_id) {
          results.skipped++;
          continue;
        }
        results.processed++;
      }
      return res.json({
        message: "Simulation terminée (dry_run).",
        ...results,
        total_preferences: preferences.length,
      });
    }

    // Exécution réelle
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
          if (!student) {
            throw new AppError("Étudiant introuvable.", 404);
          }

          // Enrollment actuel
          const current = await WorkshopStudent.findOne({
            where: {
              student_id: student.id,
              status: ENROLLMENT_STATUS.ACTIVE,
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          const fromWorkshopId = current ? current.workshop_id : null;

          if (fromWorkshopId === pref.target_workshop_id) {
            // Déjà dans le pôle cible : on marque "fulfilled" sans transfert
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

          // Sortir du pôle actuel
          if (current) {
            current.status = ENROLLMENT_STATUS.TRANSFERRED_OUT;
            current.dropped_at = new Date();
            await current.save({ transaction: t });
          }

          // Entrer dans le pôle cible
          const year = await AcademicYear.findOne({
            where: { is_current: true },
            transaction: t,
          });
          const dest = await WorkshopStudent.findOne({
            where: {
              workshop_id: pref.target_workshop_id,
              student_id: student.id,
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (dest) {
            dest.status = ENROLLMENT_STATUS.ACTIVE;
            dest.joined_at = new Date();
            dest.dropped_at = null;
            if (!dest.academic_year_id && year) dest.academic_year_id = year.id;
            await dest.save({ transaction: t });
          } else {
            await WorkshopStudent.create(
              {
                workshop_id: pref.target_workshop_id,
                student_id: student.id,
                status: ENROLLMENT_STATUS.ACTIVE,
                academic_year_id: year ? year.id : null,
                joined_at: new Date(),
              },
              { transaction: t }
            );
          }

          // Créer un transfert approuvé pour la trace
          await WorkshopTransferRequest.create(
            {
              student_id: student.id,
              from_workshop_id: fromWorkshopId,
              to_workshop_id: pref.target_workshop_id,
              status: "approved",
              forced_by: req.user.id,
              forced_at: new Date(),
              force_reason: reasonText,
            },
            { transaction: t }
          );

          // Marquer la préférence fulfilled
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

        // Notification (hors transaction)
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

/**
 * Recalage ciblé : un ou plusieurs students vers un pôle.
 * Utile pour les cas individuels sans passer par une préférence.
 *
 * Body : { student_ids: [uuid], to_workshop_id: uuid, reason? }
 */
exports.targetedRecalibrate = async (req, res, next) => {
  try {
    if (!isSuperuser(req.user)) {
      return res.status(403).json({
        message: "Réservé au président ou à l'administrateur.",
      });
    }

    const { student_ids, to_workshop_id, reason } = req.body || {};
    if (
      !Array.isArray(student_ids) ||
      student_ids.length === 0 ||
      typeof to_workshop_id !== "string"
    ) {
      return res.status(400).json({
        message: "student_ids (tableau) et to_workshop_id requis.",
      });
    }

    const target = await Workshop.findByPk(to_workshop_id);
    if (!target) {
      return res.status(404).json({ message: "Pôle cible introuvable." });
    }
    if (target.status !== "active") {
      return res.status(400).json({ message: "Ce pôle n'est pas actif." });
    }

    const reasonText = reason
      ? sanitizeText(String(reason)).slice(0, 2000)
      : "Recalage administratif ciblé";

    const results = { processed: 0, skipped: 0, errors: [] };

    for (const studentId of student_ids) {
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
            where: {
              student_id: student.id,
              status: ENROLLMENT_STATUS.ACTIVE,
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          if (current && current.workshop_id === to_workshop_id) {
            results.skipped++;
            return;
          }

          if (current) {
            current.status = ENROLLMENT_STATUS.TRANSFERRED_OUT;
            current.dropped_at = new Date();
            await current.save({ transaction: t });
          }

          const year = await AcademicYear.findOne({
            where: { is_current: true },
            transaction: t,
          });
          const dest = await WorkshopStudent.findOne({
            where: { workshop_id: to_workshop_id, student_id: student.id },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (dest) {
            dest.status = ENROLLMENT_STATUS.ACTIVE;
            dest.joined_at = new Date();
            dest.dropped_at = null;
            if (!dest.academic_year_id && year) dest.academic_year_id = year.id;
            await dest.save({ transaction: t });
          } else {
            await WorkshopStudent.create(
              {
                workshop_id: to_workshop_id,
                student_id: student.id,
                status: ENROLLMENT_STATUS.ACTIVE,
                academic_year_id: year ? year.id : null,
                joined_at: new Date(),
              },
              { transaction: t }
            );
          }

          await WorkshopTransferRequest.create(
            {
              student_id: student.id,
              from_workshop_id: current ? current.workshop_id : null,
              to_workshop_id,
              status: "approved",
              forced_by: req.user.id,
              forced_at: new Date(),
              force_reason: reasonText,
            },
            { transaction: t }
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