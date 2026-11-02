const router = require("express").Router();
const ctrl = require("../controllers/academicYearController");
const { protectAdmin } = require("../middlewares/authMiddleware");

router.get("/", ctrl.list);
router.get("/current", ctrl.current);
router.post("/", protectAdmin, ctrl.create);
router.put("/:id", protectAdmin, ctrl.update);
router.delete("/:id", protectAdmin, ctrl.remove);

module.exports = router;