const router = require("express").Router();
const ctrl = require("../controllers/ruleController");
const { protect } = require("../middlewares/authMiddleware");

// Public
router.get("/", ctrl.publicList);

// Admin (ordre important : /admin avant /:id)
router.get("/admin", protect, ctrl.adminList);
router.post("/reorder", protect, ctrl.reorder);
router.get("/:id", protect, ctrl.getOne);
router.post("/", protect, ctrl.create);
router.put("/:id", protect, ctrl.update);
router.delete("/:id", protect, ctrl.remove);

module.exports = router;