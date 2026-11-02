const {
  WorkshopTransferRequest,
  WorkshopStudent,
  Workshop,
  User,
  AcademicYear,
  sequelize,
} = require("../models");
const { ROLES, ENROLLMENT_STATUS } = require("../utils/constants");
const { sanitizeText } = require("../utils/sanitize");
const { ValidationError } = require("../utils/validators");
const { NOTIF_TYPES, push } = require("../utils/notifications");
const AppError = require("../utils/AppError");

const TRANSFER_STATUS = WorkshopTransferRequest.STATUS;

/* ─────────── Helpers ─────────── */

const isSuperuser = (user) =>
  user.role === ROLES.ADMIN || user.role === ROLES.PRESIDENT;

const isWorkshopManager = (user, workshop) =>
  workshop &&
  (workshop.instructor_id === user.id ||
    workshop.co_instructor_id === user.id);

const includeFull = [
  { model: User, as: "student", attributes: ["id", "first_name", "last_name", "email"] },
  { model: Workshop, as: "from_workshop", attributes: ["id", "title", "instructor_id", "co_instructor_id"] },
  { model: Workshop, as: "to_workshop", attributes: ["id", "title", "instructor_id", "co_instructor_id"] },
];

const validateDecisionBody = (body) => {
  const action = body.action;
  if (!["accept", "reject"].includes(action)) {
    throw new ValidationError({
      action: "Action invalide (accept | reject).",
    });
  }
  const comment = body.comment ? sanitizeText(String(body.comment)) : null;
  if (comment && comment.length > 2000) {
    throw new ValidationError({ comment: "Commentaire trop long (max 2000)." });
  }
  return { action, comment };
};

/**
 * Exécute le transfert physique : A → out, B → active.
 * Doit être appelé dans une transaction.
 */
async function executeTransfer(transfer, t) {
  // Lock source enrollment
  const sourceEnrollment = await WorkshopStudent.findOne({
    where: {
      workshop_id: transfer.from_workshop_id,
      student_id: transfer.student_id,
      status: ENROLLMENT_STATUS.ACTIVE,
    },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!sourceEnrollment) {
    throw new AppError(
      "L'étudiant n'est plus actif dans le pôle source.",
      409
    );
  }

  // Update source → transferred_out
  sourceEnrollment.status = ENROLLMENT_STATUS.TRANSFERRED_OUT;
  sourceEnrollment.dropped_at = new Date();
  await sourceEnrollment.save({ transaction: t });

  // Destination : reactivate or create
  const dest = await WorkshopStudent.findOne({
    where: {
      workshop_id: transfer.to_workshop_id,
      student_id: transfer.student_id,
    },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  const year = await AcademicYear.findOne({
    where: { is_current: true },
    transaction: t,
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
        workshop_id: transfer.to_workshop_id,
        student_id: transfer.student_id,
        status: ENROLLMENT_STATUS.ACTIVE,
        academic_year_id: year ? year.id : null,
        joined_at: new Date(),
      },
      { transaction: t }
    );
  }

  return { sourceEnrollment };
}

/* ─────────── Création d'une demande (étudiant) ─────────── */

exports.create = async (req, res, next) => {
  try {
    const to_workshop_id = req.body.to_workshop_id;
    if (!to_workshop_id || typeof to_workshop_id !== "string") {
      return res
        .status(400)
        .json({ message: "Pôle cible requis (to_workshop_id)." });
    }

    const reason = req.body.reason
      ? sanitizeText(String(req.body.reason)).slice(0, 2000)
      : null;

    // Son pôle actuel
    const currentEnrollment = await WorkshopStudent.findOne({
      where: { student_id: req.user.id, status: ENROLLMENT_STATUS.ACTIVE },
      include: [{ model: Workshop, as: "workshop" }],
    });
    if (!currentEnrollment) {
      return res.status(400).json({
        message: "Vous n'êtes actuellement inscrit à aucun pôle.",
      });
    }
    const from_workshop_id = currentEnrollment.workshop_id;

    if (from_workshop_id === to_workshop_id) {
      return res.status(400).json({
        message: "Vous ne pouvez pas demander un transfert vers votre pôle actuel.",
      });
    }

    const toWorkshop = await Workshop.findByPk(to_workshop_id);
    if (!toWorkshop) {
      return res.status(404).json({ message: "Pôle cible introuvable." });
    }
    if (toWorkshop.status !== "active") {
      return res.status(400).json({ message: "Ce pôle n'est pas actif." });
    }

    // Pas de transfert pending déjà
    const existingPending = await WorkshopTransferRequest.findOne({
      where: {
        student_id: req.user.id,
        status: {
          [require("sequelize").Op.in]: [
            TRANSFER_STATUS.PENDING_SOURCE,
            TRANSFER_STATUS.PENDING_DESTINATION,
          ],
        },
      },
    });
    if (existingPending) {
      return res.status(409).json({
        message: "Vous avez déjà un transfert en cours.",
        transfer_id: existingPending.id,
      });
    }

    const transfer = await WorkshopTransferRequest.create({
      student_id: req.user.id,
      from_workshop_id,
      to_workshop_id,
      reason,
      status: TRANSFER_STATUS.PENDING_SOURCE,
    });

    // Notifier le chef du pôle source (et co-instructor)
    if (currentEnrollment.workshop) {
      const managers = [
        currentEnrollment.workshop.instructor_id,
        currentEnrollment.workshop.co_instructor_id,
      ].filter(Boolean);
      for (const mgrId of managers) {
        push(mgrId, NOTIF_TYPES.TRANSFER_REQUESTED, {
          transfer_id: transfer.id,
          student_name: `${req.user.first_name} ${req.user.last_name}`,
          from_workshop_title: currentEnrollment.workshop.title,
          to_workshop_title: toWorkshop.title,
        });
      }
    }

    const full = await WorkshopTransferRequest.findByPk(transfer.id, {
      include: includeFull,
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

    // Filtre status
    if (
      typeof req.query.status === "string" &&
      Object.values(TRANSFER_STATUS).includes(req.query.status)
    ) {
      where.status = req.query.status;
    }

    // Filtre selon rôle
    if (req.user.role === ROLES.STUDENT) {
      where.student_id = req.user.id;
    } else if (!isSuperuser(req.user) && req.user.role !== ROLES.SECRETAIRE_GENERALE) {
      // Chef/adjoint : transferts sortants ou entrants de ses pôles
      const ownedWorkshops = await Workshop.findAll({
        where: {
          [require("sequelize").Op.or]: [
            { instructor_id: req.user.id },
            { co_instructor_id: req.user.id },
          ],
        },
        attributes: ["id"],
      });
      const ids = ownedWorkshops.map((w) => w.id);
      where[require("sequelize").Op.or] = [
        { from_workshop_id: { [require("sequelize").Op.in]: ids } },
        { to_workshop_id: { [require("sequelize").Op.in]: ids } },
      ];
    }

    const transfers = await WorkshopTransferRequest.findAll({
      where,
      include: includeFull,
      order: [["created_at", "DESC"]],
      limit: 200,
    });
    res.json(transfers);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Détail ─────────── */

exports.getOne = async (req, res, next) => {
  try {
    const transfer = await WorkshopTransferRequest.findByPk(req.params.id, {
      include: includeFull,
    });
    if (!transfer) {
      return res.status(404).json({ message: "Transfert introuvable." });
    }

    // Autorisations
    const isStudent = transfer.student_id === req.user.id;
    const isFromMgr = isWorkshopManager(req.user, transfer.from_workshop);
    const isToMgr = isWorkshopManager(req.user, transfer.to_workshop);
    const canSee =
      isStudent ||
      isFromMgr ||
      isToMgr ||
      isSuperuser(req.user) ||
      req.user.role === ROLES.SECRETAIRE_GENERALE;

    if (!canSee) {
      return res.status(403).json({ message: "Accès refusé." });
    }
    res.json(transfer);
  } catch (err) {
    next(err);
  }
};

/* ─────────── Annulation par l'étudiant ─────────── */

exports.cancel = async (req, res, next) => {
  try {
    const transfer = await WorkshopTransferRequest.findByPk(req.params.id);
    if (!transfer) {
      return res.status(404).json({ message: "Transfert introuvable." });
    }
    if (transfer.student_id !== req.user.id) {
      return res.status(403).json({ message: "Vous n'êtes pas l'auteur de cette demande." });
    }
    if (
      ![TRANSFER_STATUS.PENDING_SOURCE, TRANSFER_STATUS.PENDING_DESTINATION].includes(
        transfer.status
      )
    ) {
      return res.status(400).json({
        message: "Cette demande ne peut plus être annulée.",
      });
    }
    await transfer.update({ status: TRANSFER_STATUS.CANCELLED_BY_STUDENT });
    res.json({ message: "Demande annulée.", transfer });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Décision du chef source ─────────── */

exports.sourceDecision = async (req, res, next) => {
  try {
    const { action, comment } = validateDecisionBody(req.body);

    const transfer = await WorkshopTransferRequest.findByPk(req.params.id, {
      include: includeFull,
    });
    if (!transfer) {
      return res.status(404).json({ message: "Transfert introuvable." });
    }
    if (transfer.status !== TRANSFER_STATUS.PENDING_SOURCE) {
      return res.status(400).json({
        message: `Statut actuel : ${transfer.status}. Décision source impossible.`,
      });
    }

    // Autorisation : chef/adjoint de la source OU superuser
    if (!isSuperuser(req.user) && !isWorkshopManager(req.user, transfer.from_workshop)) {
      return res.status(403).json({
        message: "Seul le chef du pôle source peut décider.",
      });
    }

    const now = new Date();
    const update = {
      source_decision_by: req.user.id,
      source_decision_at: now,
      source_decision_comment: comment,
    };

    if (action === "reject") {
      update.status = TRANSFER_STATUS.REJECTED_BY_SOURCE;
      await transfer.update(update);
      push(transfer.student_id, NOTIF_TYPES.TRANSFER_SOURCE_REJECTED, {
        transfer_id: transfer.id,
        from_workshop_title: transfer.from_workshop.title,
        comment,
      });
      return res.json({ message: "Transfert rejeté.", transfer });
    }

    // accept → pending_destination
    update.status = TRANSFER_STATUS.PENDING_DESTINATION;
    await transfer.update(update);

    // Notifier étudiant + chef destination
    push(transfer.student_id, NOTIF_TYPES.TRANSFER_SOURCE_ACCEPTED, {
      transfer_id: transfer.id,
      to_workshop_title: transfer.to_workshop.title,
    });
    const destManagers = [
      transfer.to_workshop.instructor_id,
      transfer.to_workshop.co_instructor_id,
    ].filter(Boolean);
    for (const mgr of destManagers) {
      push(mgr, NOTIF_TYPES.TRANSFER_REQUESTED, {
        transfer_id: transfer.id,
        student_name: `${transfer.student.first_name} ${transfer.student.last_name}`,
        from_workshop_title: transfer.from_workshop.title,
        to_workshop_title: transfer.to_workshop.title,
        source_accepted: true,
      });
    }

    res.json({ message: "Transfert accepté côté source.", transfer });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Décision du chef destination ─────────── */

exports.destinationDecision = async (req, res, next) => {
  try {
    const { action, comment } = validateDecisionBody(req.body);

    const transfer = await WorkshopTransferRequest.findByPk(req.params.id, {
      include: includeFull,
    });
    if (!transfer) {
      return res.status(404).json({ message: "Transfert introuvable." });
    }
    if (transfer.status !== TRANSFER_STATUS.PENDING_DESTINATION) {
      return res.status(400).json({
        message: `Statut actuel : ${transfer.status}. Décision destination impossible.`,
      });
    }

    if (!isSuperuser(req.user) && !isWorkshopManager(req.user, transfer.to_workshop)) {
      return res.status(403).json({
        message: "Seul le chef du pôle destination peut décider.",
      });
    }

    const now = new Date();

    if (action === "reject") {
      await transfer.update({
        status: TRANSFER_STATUS.REJECTED_BY_DESTINATION,
        destination_decision_by: req.user.id,
        destination_decision_at: now,
        destination_decision_comment: comment,
      });
      push(transfer.student_id, NOTIF_TYPES.TRANSFER_DESTINATION_REJECTED, {
        transfer_id: transfer.id,
        to_workshop_title: transfer.to_workshop.title,
        comment,
      });
      return res.json({ message: "Transfert rejeté côté destination.", transfer });
    }

    // accept → exécution atomique
    await sequelize.transaction(async (t) => {
      await executeTransfer(transfer, t);
      await transfer.update(
        {
          status: TRANSFER_STATUS.APPROVED,
          destination_decision_by: req.user.id,
          destination_decision_at: now,
          destination_decision_comment: comment,
        },
        { transaction: t }
      );
    });

    push(transfer.student_id, NOTIF_TYPES.TRANSFER_DESTINATION_ACCEPTED, {
      transfer_id: transfer.id,
      to_workshop_title: transfer.to_workshop.title,
    });

    res.json({ message: "Transfert approuvé. Vous êtes maintenant dans le nouveau pôle.", transfer });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Force par admin/président ─────────── */

exports.force = async (req, res, next) => {
  try {
    if (!isSuperuser(req.user)) {
      return res.status(403).json({
        message: "Réservé au président ou à l'administrateur.",
      });
    }

    const transfer = await WorkshopTransferRequest.findByPk(req.params.id, {
      include: includeFull,
    });
    if (!transfer) {
      return res.status(404).json({ message: "Transfert introuvable." });
    }
    if (
      ![TRANSFER_STATUS.PENDING_SOURCE, TRANSFER_STATUS.PENDING_DESTINATION].includes(
        transfer.status
      )
    ) {
      return res.status(400).json({
        message: `Statut actuel : ${transfer.status}. Force impossible.`,
      });
    }

    const force_reason = req.body.force_reason
      ? sanitizeText(String(req.body.force_reason)).slice(0, 2000)
      : null;

    await sequelize.transaction(async (t) => {
      await executeTransfer(transfer, t);
      await transfer.update(
        {
          status: TRANSFER_STATUS.APPROVED,
          forced_by: req.user.id,
          forced_at: new Date(),
          force_reason,
        },
        { transaction: t }
      );
    });

    push(transfer.student_id, NOTIF_TYPES.TRANSFER_FORCED, {
      transfer_id: transfer.id,
      to_workshop_title: transfer.to_workshop.title,
      force_reason,
    });

    res.json({ message: "Transfert forcé et exécuté.", transfer });
  } catch (err) {
    next(err);
  }
};

/* ─────────── Force directe (recalage individuel) ─────────── */
/* Crée + approuve en une seule opération. Pour les recalages administratifs. */

exports.forceDirect = async (req, res, next) => {
  try {
    if (!isSuperuser(req.user)) {
      return res.status(403).json({
        message: "Réservé au président ou à l'administrateur.",
      });
    }

    const { student_id, to_workshop_id, reason } = req.body || {};
    if (!student_id || !to_workshop_id) {
      return res.status(400).json({
        message: "student_id et to_workshop_id requis.",
      });
    }

    // Vérifier le student
    const student = await User.findByPk(student_id);
    if (!student) {
      return res.status(404).json({ message: "Étudiant introuvable." });
    }
    if (student.role !== ROLES.STUDENT) {
      return res.status(400).json({
        message: "Le recalage ne s'applique qu'aux étudiants.",
      });
    }

    // Pôle cible
    const toWorkshop = await Workshop.findByPk(to_workshop_id);
    if (!toWorkshop) {
      return res.status(404).json({ message: "Pôle cible introuvable." });
    }
    if (toWorkshop.status !== "active") {
      return res.status(400).json({ message: "Ce pôle n'est pas actif." });
    }

    // Pôle actuel (peut ne pas exister)
    const currentEnrollment = await WorkshopStudent.findOne({
      where: { student_id, status: ENROLLMENT_STATUS.ACTIVE },
    });

    if (currentEnrollment && currentEnrollment.workshop_id === to_workshop_id) {
      return res.status(400).json({
        message: "L'étudiant est déjà actif dans ce pôle.",
      });
    }

    const force_reason = reason ? sanitizeText(String(reason)).slice(0, 2000) : null;

    const result = await sequelize.transaction(async (t) => {
      // Créer la demande "fantôme" déjà approuvée
      const transfer = await WorkshopTransferRequest.create(
        {
          student_id,
          from_workshop_id: currentEnrollment ? currentEnrollment.workshop_id : null,
          to_workshop_id,
          status: TRANSFER_STATUS.APPROVED,
          forced_by: req.user.id,
          forced_at: new Date(),
          force_reason,
        },
        { transaction: t }
      );

      // Exécuter si enrollment source existe
      if (currentEnrollment) {
        await executeTransfer(transfer, t);
      } else {
        // Pas de source → créer juste l'enrollment destination
        const year = await AcademicYear.findOne({
          where: { is_current: true },
          transaction: t,
        });
        const existing = await WorkshopStudent.findOne({
          where: { workshop_id: to_workshop_id, student_id },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (existing) {
          existing.status = ENROLLMENT_STATUS.ACTIVE;
          existing.joined_at = new Date();
          existing.dropped_at = null;
          if (!existing.academic_year_id && year) existing.academic_year_id = year.id;
          await existing.save({ transaction: t });
        } else {
          await WorkshopStudent.create(
            {
              workshop_id: to_workshop_id,
              student_id,
              status: ENROLLMENT_STATUS.ACTIVE,
              academic_year_id: year ? year.id : null,
              joined_at: new Date(),
            },
            { transaction: t }
          );
        }
      }

      return transfer;
    });

    push(student_id, NOTIF_TYPES.TRANSFER_FORCED, {
      transfer_id: result.id,
      to_workshop_title: toWorkshop.title,
      force_reason,
    });

    const full = await WorkshopTransferRequest.findByPk(result.id, {
      include: includeFull,
    });
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
};