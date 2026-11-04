const { DataTypes } = require("sequelize");
const { ENROLLMENT_STATUS } = require("../utils/constants");
const AppError = require("../utils/AppError");

module.exports = (sequelize) => {
  const WorkshopStudent = sequelize.define(
    "WorkshopStudent",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      workshop_id: { type: DataTypes.UUID, allowNull: false },
      student_id: { type: DataTypes.UUID, allowNull: false },
      status: {
        type: DataTypes.ENUM(
          ENROLLMENT_STATUS.PENDING,
          ENROLLMENT_STATUS.ACTIVE,
          ENROLLMENT_STATUS.COMPLETED,
          ENROLLMENT_STATUS.DROPPED,
          ENROLLMENT_STATUS.TRANSFERRED_OUT,
          ENROLLMENT_STATUS.REJECTED
        ),
        allowNull: false,
        defaultValue: ENROLLMENT_STATUS.PENDING,
      },
      academic_year_id: { type: DataTypes.INTEGER, allowNull: true },
      promotion: { type: DataTypes.INTEGER, allowNull: true },
      joined_at: { type: DataTypes.DATE, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      dropped_at: { type: DataTypes.DATE, allowNull: true },
      rejected_at: { type: DataTypes.DATE, allowNull: true },
      rejected_by: { type: DataTypes.UUID, allowNull: true },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "workshop_students",
      indexes: [
        { unique: true, fields: ["workshop_id", "student_id"] },
        { fields: ["student_id"] },
        { fields: ["status"] },
      ],
      hooks: {
        beforeSave: async (enrollment, options) => {
          if (enrollment.status !== ENROLLMENT_STATUS.ACTIVE) return;

          const { Op } = require("sequelize");

          const where = {
            student_id: enrollment.student_id,
            status: ENROLLMENT_STATUS.ACTIVE,
          };

          if (enrollment.id) {
            where.id = { [Op.ne]: enrollment.id };
          }

          const conflicting = await WorkshopStudent.findOne({
            where,
            attributes: ["id", "workshop_id"],
            transaction: options.transaction, // ← FIX : lire dans la même transaction
          });

          if (conflicting) {
            throw new AppError(
              "Cet étudiant a déjà une inscription active dans un autre pôle.",
              409
            );
          }
        },
      },
    }
  );

  return WorkshopStudent;
};