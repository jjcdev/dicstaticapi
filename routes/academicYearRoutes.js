const router = require("express").Router();
const ctrl = require("../controllers/academicYearController");
const { protect } = require("../middlewares/authMiddleware");

router.get("/", ctrl.list);
router.get("/current", ctrl.current);
router.post("/", protect, ctrl.create);
router.put("/:id", protect, ctrl.update);
router.delete("/:id", protect, ctrl.remove);

module.exports = router;