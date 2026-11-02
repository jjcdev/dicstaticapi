const router = require("express").Router();
const ctrl = require("../controllers/galleryController");
const { protectAdmin } = require("../middlewares/authMiddleware");
const { multerUpload } = require("../middlewares/upload");

router.get("/", ctrl.list);
router.post("/", protectAdmin, multerUpload.single("image"), ctrl.create);
router.put("/:id", protectAdmin, multerUpload.single("image"), ctrl.update);
router.delete("/:id", protectAdmin, ctrl.remove);

module.exports = router;