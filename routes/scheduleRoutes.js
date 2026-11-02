const router = require("express").Router();
const ctrl = require("../controllers/scheduleController");
const { protect } = require("../middlewares/authMiddleware");

// Important : /missing avant /:id
router.get("/missing", protect, ctrl.missing);

router.get("/", protect, ctrl.list);
router.post("/", protect, ctrl.create);

router.get("/:id", protect, ctrl.getOne);
router.delete("/:id", protect, ctrl.remove);

router.post("/:id/publish", protect, ctrl.publish);
router.post("/:id/unpublish", protect, ctrl.unpublish);

// Slots
router.post("/:id/slots", protect, ctrl.addSlot);
router.patch("/:id/slots/:slotId", protect, ctrl.updateSlot);
router.delete("/:id/slots/:slotId", protect, ctrl.deleteSlot);
router.post("/:id/slots/reorder", protect, ctrl.reorderSlots);

module.exports = router;