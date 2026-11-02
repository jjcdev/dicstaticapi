const { DataTypes } = require("sequelize");

const STATUS = {
  PENDING_SOURCE: "pending_source",
  PENDING_DESTINATION: "pending_destination",
  APPROVED: "approved",
  REJECTED_BY_SOURCE: "rejected_by_source",
  REJECTED_BY_DESTINATION: "rejected_by_destination",
  CANCELLED_BY_STUDENT: "cancelled_by_student",
};

module.exports = (sequelize) => {
  const Transfer = sequelize.define(
    "WorkshopTransferRequest",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      from_workshop_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      to_workshop_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Message du student expliquant sa demande",
      },
      status: {
        type: DataTypes.ENUM(...Object.values(STATUS)),
        allowNull: false,
        defaultValue: STATUS.PENDING_SOURCE,
      },
      // Décision chef source
      source_decision_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      source_decision_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      source_decision_comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Décision chef destination
      destination_decision_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      destination_decision_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      destination_decision_comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Force (président/admin)
      forced_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      forced_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      force_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "workshop_transfer_requests",
      indexes: [
        { fields: ["student_id", "status"] },
        { fields: ["from_workshop_id"] },
        { fields: ["to_workshop_id"] },
        { fields: ["status"] },
      ],
    }
  );

  Transfer.STATUS = STATUS;
  return Transfer;
};