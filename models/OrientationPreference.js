const { DataTypes } = require("sequelize");
const { ORIENTATION_STATUS } = require("../utils/constants");

module.exports = (sequelize) =>
  sequelize.define(
    "OrientationPreference",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      target_workshop_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          ORIENTATION_STATUS.PENDING,
          ORIENTATION_STATUS.FULFILLED,
          ORIENTATION_STATUS.CANCELLED,
          ORIENTATION_STATUS.OVERRIDDEN
        ),
        allowNull: false,
        defaultValue: ORIENTATION_STATUS.PENDING,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Message du student expliquant son choix",
      },
      decided_by: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "User qui a validé/recalé (null tant que pending)",
      },
      decided_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "orientation_preferences",
      indexes: [
        { fields: ["student_id", "status"] },
        { fields: ["target_workshop_id"] },
      ],
    }
  );