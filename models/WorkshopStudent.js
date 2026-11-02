const { DataTypes } = require("sequelize");
const { ENROLLMENT_STATUS } = require("../utils/constants");

module.exports = (sequelize) =>
  sequelize.define(
    "WorkshopStudent",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workshop_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          ENROLLMENT_STATUS.PENDING,
          ENROLLMENT_STATUS.ACTIVE,
          ENROLLMENT_STATUS.COMPLETED,
          ENROLLMENT_STATUS.DROPPED,
          ENROLLMENT_STATUS.TRANSFERRED_OUT
        ),
        allowNull: false,
        defaultValue: ENROLLMENT_STATUS.PENDING,
      },
      academic_year_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      promotion: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Numéro de promotion (cohorte) au moment de l'inscription",
      },
      joined_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      dropped_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "workshop_students",
      indexes: [
        { unique: true, fields: ["workshop_id", "student_id"] },
        { fields: ["student_id"] },
        { fields: ["status"] },
      ],
    }
  );