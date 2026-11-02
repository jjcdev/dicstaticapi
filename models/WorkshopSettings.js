const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "WorkshopSettings",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workshop_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
      },
      devoir_weight: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
        validate: { min: 0, max: 100 },
      },
      examen_weight: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 50,
        validate: { min: 0, max: 100 },
      },
      project_weight: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0, max: 100 },
      },
      participation_weight: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0, max: 100 },
      },
      sort_by: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "name",
      },
      sort_order: {
        type: DataTypes.ENUM("asc", "desc"),
        allowNull: false,
        defaultValue: "asc",
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "workshop_settings",
    }
  );