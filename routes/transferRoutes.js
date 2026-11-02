const router = require("express").Router();
const ctrl = require("../controllers/transferController");
const { protect } = require("../middlewares/authMiddleware");

router.post("/", protect, ctrl.create);
router.get("/", protect, ctrl.list);
router.get("/:id", protect, ctrl.getOne);

router.post("/:id/cancel", protect, ctrl.cancel);
router.post("/:id/source-decision", protect, ctrl.sourceDecision);
router.post("/:id/destination-decision", protect, ctrl.destinationDecision);
router.post("/:id/force", protect, ctrl.force);

// Recalage individuel direct
router.post("/force-direct", protect, ctrl.forceDirect);

module.exports = router;