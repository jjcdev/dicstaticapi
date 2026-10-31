const router = require("express").Router();
const ctrl = require("../controllers/programController");
const { protect } = require("../middlewares/authMiddleware");
const { programPublicLimiter } = require("../middlewares/rateLimit");

// Public
router.get("/", programPublicLimiter, ctrl.publicList);
router.get("/:id", programPublicLimiter, ctrl.publicGetOne);

// Admin — déclarés APRÈS pour que /admin ne soit pas capté par /:id
router.get("/admin/list", protect, ctrl.adminList);
router.get("/admin/:id", protect, ctrl.adminGetOne);
router.post("/reorder", protect, ctrl.reorder);
router.post("/", protect, ctrl.create);
router.put("/:id", protect, ctrl.update);
router.delete("/:id", protect, ctrl.remove);

module.exports = router;