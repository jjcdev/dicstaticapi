const router = require("express").Router();
const ctrl = require("../controllers/gradebookController");
const { protect } = require("../middlewares/authMiddleware");

/* ─── Mes notes (étudiant — self) ─── */
router.get("/me", protect, ctrl.getMyGrades);

/* ─── Bordereau (chef + adjoint owner, ou superuser) ─── */
router.get("/workshops/:workshopId", protect, ctrl.getGradebook);

/* ─── Assessments ─── */
router.get("/workshops/:workshopId/assessments", protect, ctrl.getAssessments);
router.post("/workshops/:workshopId/assessments", protect, ctrl.createAssessment);
router.patch("/assessments/:id", protect, ctrl.updateAssessment);
router.delete("/assessments/:id", protect, ctrl.deleteAssessment);

/* ─── Notes ─── */
router.patch("/assessments/:assessmentId/grades/:studentId", protect, ctrl.upsertGrade);

/* ─── Paramètres + bonus ─── */
router.patch("/workshops/:workshopId/settings", protect, ctrl.updateSettings);
router.post("/workshops/:workshopId/bonuses", protect, ctrl.addBonus);
router.delete("/bonuses/:id", protect, ctrl.deleteBonus);

module.exports = router;