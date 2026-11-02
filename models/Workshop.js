const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Workshop",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: {
          notEmpty: { msg: "Le titre est obligatoire." },
          len: { args: [3, 200], msg: "Titre : 3 à 200 caractères." },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: { msg: "La description est obligatoire." },
          len: { args: [10, 5000], msg: "Description : 10 à 5000 caractères." },
        },
      },
      type: {
        type: DataTypes.ENUM("preparation", "specialization", "general"),
        allowNull: false,
        defaultValue: "general",
        comment: "preparation | specialization | general",
      },
      objectives: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
      },
      location: {
        type: DataTypes.STRING(160),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("active", "completed", "cancelled"),
        allowNull: false,
        defaultValue: "active",
      },
      instructor_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      co_instructor_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "workshops",
      paranoid: true,
      indexes: [
        { fields: ["instructor_id"] },
        { fields: ["co_instructor_id"] },
        { fields: ["status"] },
        { fields: ["type"] },
      ],
    }
  );