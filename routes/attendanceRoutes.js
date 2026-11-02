const router = require("express").Router();
const ctrl = require("../controllers/attendanceController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/rbac");

router.get("/my", protect, ctrl.getMyAttendance);
router.get(
  "/workshops/:workshopId",
  protect,
  authorize("attendance:read_all", "attendance:read_own"),
  ctrl.getWorkshopAttendances
);

router.post(
  "/sessions/:sessionId/bulk",
  protect,
  authorize("attendance:manage_own", "attendance:manage"),
  ctrl.markBulkAttendance
);

router.post(
  "/sessions/:sessionId/:studentId",
  protect,
  authorize("attendance:manage_own", "attendance:manage"),
  ctrl.markAttendance
);

module.exports = router;