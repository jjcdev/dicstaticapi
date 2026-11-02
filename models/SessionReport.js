const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "SessionReport",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      client_id: {
        type: DataTypes.UUID,
        allowNull: true,
        unique: true,
        comment: "ID généré côté mobile pour idempotence offline",
      },
      client_created_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Date de création locale (offline), utilisée pour la fenêtre de 24h",
      },
      workshop_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      author_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: "Chef ou adjoint qui a rédigé",
      },
      instructor_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Snapshot nom du chef au moment de la création",
      },
      co_instructor_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "Snapshot nom de l'adjoint au moment de la création",
      },
      activities: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      concepts: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      takeaways: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "session_reports",
      paranoid: true,
      indexes: [
        { fields: ["workshop_id", "date"] },
        { fields: ["author_id"] },
        { unique: true, fields: ["client_id"] },
      ],
    }
  );