module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "AcademicYear",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      label: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      start_date: { type: DataTypes.DATEONLY, allowNull: false },
      end_date: { type: DataTypes.DATEONLY, allowNull: false },
      is_current: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: "academic_years" }
  );