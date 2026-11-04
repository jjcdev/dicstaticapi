const { DataTypes } = require("sequelize");
const { SCHEDULE_STATUS } = require("../utils/constants");

module.exports = (sequelize) =>
  sequelize.define(
    "WeeklySchedule",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workshop_id: { type: DataTypes.UUID, allowNull: false },
      week_start: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: "Dimanche de la semaine (ISO YYYY-MM-DD)",
      },
      status: {
        type: DataTypes.ENUM(
          SCHEDULE_STATUS.PROPOSED,
          SCHEDULE_STATUS.DRAFT,
          SCHEDULE_STATUS.PUBLISHED,
          SCHEDULE_STATUS.REJECTED
        ),
        allowNull: false,
        defaultValue: SCHEDULE_STATUS.PROPOSED,
      },
      created_by: { type: DataTypes.UUID, allowNull: false },
      published_by: { type: DataTypes.UUID, allowNull: true },
      published_at: { type: DataTypes.DATE, allowNull: true },

      // Nouveaux champs pour le rejet
      rejected_by: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "SG ou secrétaire adjoint qui a rejeté",
      },
      rejected_at: { type: DataTypes.DATE, allowNull: true },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Motif du rejet (obligatoire côté contrôleur)",
      },
    },
    {
      tableName: "weekly_schedules",
      indexes: [
        { fields: ["workshop_id", "week_start", "status"] },
        { fields: ["week_start"] },
        { fields: ["status"] },
      ],
    }
  );