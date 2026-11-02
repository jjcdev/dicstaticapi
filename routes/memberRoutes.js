const router = require("express").Router();
const ctrl = require("../controllers/memberController");
const { protectAdmin } = require("../middlewares/authMiddleware");
const { multerUpload } = require("../middlewares/upload");

router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.post("/", protectAdmin, multerUpload.single("photo"), ctrl.create);
router.put("/:id", protectAdmin, multerUpload.single("photo"), ctrl.update);
router.delete("/:id", protectAdmin, ctrl.remove);

module.exports = router;