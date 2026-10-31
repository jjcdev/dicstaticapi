module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "ProgramItem",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      start_date: { type: DataTypes.DATEONLY, allowNull: false },
      end_date: { type: DataTypes.DATEONLY, allowNull: true },
      start_time: { type: DataTypes.TIME, allowNull: true },
      end_time: { type: DataTypes.TIME, allowNull: true },
      location: { type: DataTypes.STRING(160), allowNull: true },
      room: { type: DataTypes.STRING(120), allowNull: true },
      pole: {
        type: DataTypes.ENUM("ia", "cybersecurity", "robotics"),
        allowNull: true,
      },
      academic_year_id: { type: DataTypes.INTEGER, allowNull: true },
      is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    { tableName: "program_items" }
  );