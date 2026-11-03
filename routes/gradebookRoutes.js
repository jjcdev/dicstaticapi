const router = require("express").Router();
const ctrl = require("../controllers/gradebookController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/rbac");

router.get("/me", protect, ctrl.getMyGrades);
// Bordereau complet
router.get(
  "/workshops/:workshopId",
  protect,
  authorize("grade:read_all", "grade:read_own"),
  ctrl.getGradebook
);

// Assessments CRUD
router.get("/workshops/:workshopId/assessments", protect, ctrl.getAssessments);
router.post("/workshops/:workshopId/assessments", protect, ctrl.createAssessment);
router.patch("/assessments/:id", protect, ctrl.updateAssessment);
router.delete("/assessments/:id", protect, ctrl.deleteAssessment);

// Note individuelle (upsert)
router.patch(
  "/assessments/:assessmentId/grades/:studentId",
  protect,
  authorize("grade:manage_own", "grade:manage"),
  ctrl.upsertGrade
);

// Paramètres du bordereau
router.patch("/workshops/:workshopId/settings", protect, ctrl.updateSettings);

// Bonus
router.post("/workshops/:workshopId/bonuses", protect, ctrl.addBonus);
router.delete("/bonuses/:id", protect, ctrl.deleteBonus);

module.exports = router;