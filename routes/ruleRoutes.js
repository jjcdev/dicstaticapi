const router = require("express").Router();
const ctrl = require("../controllers/ruleController");
const { protectAdmin } = require("../middlewares/authMiddleware");

// Public
router.get("/", ctrl.publicList);

// Admin
router.get("/admin", protectAdmin, ctrl.adminList);
router.post("/reorder", protectAdmin, ctrl.reorder);
router.get("/:id", protectAdmin, ctrl.getOne);
router.post("/", protectAdmin, ctrl.create);
router.put("/:id", protectAdmin, ctrl.update);
router.delete("/:id", protectAdmin, ctrl.remove);

module.exports = router;