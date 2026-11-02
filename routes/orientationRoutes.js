const router = require("express").Router();
const ctrl = require("../controllers/orientationController");
const { protect } = require("../middlewares/authMiddleware");

// Étudiant
router.post("/", protect, ctrl.create);
router.get("/mine", protect, ctrl.getMine);
router.post("/:id/cancel", protect, ctrl.cancelMine);

// Direction
router.get("/", protect, ctrl.list);
router.get("/stats", protect, ctrl.stats);

module.exports = router;