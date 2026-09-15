module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "Event",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(160), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      event_date: { type: DataTypes.DATEONLY, allowNull: false },
      location: { type: DataTypes.STRING(160), allowNull: true },
      cover_image: { type: DataTypes.STRING(255), allowNull: true },
      academic_year_id: { type: DataTypes.INTEGER, allowNull: true },
    },
    { tableName: "events" }
  );