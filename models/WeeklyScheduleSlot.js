const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "WeeklyScheduleSlot",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      schedule_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      day_of_week: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: { args: [0], msg: "day_of_week : 0 (dimanche) à 6 (samedi)." },
          max: { args: [6], msg: "day_of_week : 0 (dimanche) à 6 (samedi)." },
        },
        comment: "0 = dimanche, 1 = lundi, ..., 6 = samedi",
      },
      start_time: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      end_time: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(160),
        allowNull: false,
      },
      location: {
        type: DataTypes.STRING(160),
        allowNull: true,
      },
      room: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      display_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "weekly_schedule_slots",
      indexes: [
        { fields: ["schedule_id", "day_of_week", "start_time"] },
      ],
    }
  );