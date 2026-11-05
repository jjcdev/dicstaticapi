const router = require("express").Router();
const ctrl = require("../controllers/gradebookController");
const { protect } = require("../middlewares/authMiddleware");

/* ─── Mes notes (self) ─── */
router.get("/me", protect, ctrl.getMyGrades);

/* ─── Bordereau ─── */
router.get("/workshops/:workshopId", protect, ctrl.getGradebook);
router.get("/workshops/:workshopId/computed", protect, ctrl.getComputedGradebook);

/* ─── Assessments ─── */
router.get("/workshops/:workshopId/assessments", protect, ctrl.getAssessments);
router.post("/workshops/:workshopId/assessments", protect, ctrl.createAssessment);
router.patch("/assessments/:id", protect, ctrl.updateAssessment);
router.delete("/assessments/:id", protect, ctrl.deleteAssessment);

/* ─── Notes (individuel + bulk) ─── */
router.patch("/assessments/:assessmentId/grades/bulk", protect, ctrl.bulkUpsertGrades);
router.patch("/assessments/:assessmentId/grades/:studentId", protect, ctrl.upsertGrade);

/* ─── Paramètres + bonus ─── */
router.patch("/workshops/:workshopId/settings", protect, ctrl.updateSettings);
router.post("/workshops/:workshopId/bonuses", protect, ctrl.addBonus);
router.delete("/bonuses/:id", protect, ctrl.deleteBonus);

module.exports = router;