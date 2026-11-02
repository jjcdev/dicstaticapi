const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Session",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        defaultValue: "Séance",
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      session_number: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Numéro auto de la séance dans l'atelier",
      },
      workshop_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "sessions",
      paranoid: true,
      indexes: [{ fields: ["workshop_id", "date"] }],
      hooks: {
        /**
         * Cascade manuel : quand une Session est soft-deleted,
         * on soft-delete (ou hard-delete) ses enfants.
         * Les SessionEnrollment et Attendance sont hard-deleted.
         */
        beforeDestroy: async (session) => {
          const { SessionEnrollment, Attendance } = sequelize.models;
          await SessionEnrollment.destroy({ where: { session_id: session.id } });
          await Attendance.destroy({ where: { session_id: session.id } });
        },
      },
    }
  );