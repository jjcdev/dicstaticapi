const router = require("express").Router();
const ctrl = require("../controllers/scheduleController");
const { protect } = require("../middlewares/authMiddleware");

/* ─── Lecture ─── */
router.get("/missing", protect, ctrl.missing);
router.get("/", protect, ctrl.list);
router.get("/:id", protect, ctrl.getOne);

/* ─── Création / suppression ─── */
router.post("/", protect, ctrl.create);
router.delete("/:id", protect, ctrl.remove);

/* ─── Publication (SG + secrétaire adjoint) ─── */
router.post("/:id/publish", protect, ctrl.publish);
router.post("/:id/unpublish", protect, ctrl.unpublish);

/* ─── Rejet (SG + secrétaire adjoint) ─── */
router.post("/:id/reject", protect, ctrl.reject);

/* ─── Slots ─── */
router.post("/:id/slots", protect, ctrl.addSlot);
router.patch("/:id/slots/:slotId", protect, ctrl.updateSlot);
router.delete("/:id/slots/:slotId", protect, ctrl.deleteSlot);
router.post("/:id/slots/reorder", protect, ctrl.reorderSlots);

module.exports = router;