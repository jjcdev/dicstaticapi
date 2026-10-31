module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "RuleSection",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(160), allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false },
      display_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      slug: { type: DataTypes.STRING(160), allowNull: true, unique: true },
      is_published: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    { tableName: "rule_sections" }
  );