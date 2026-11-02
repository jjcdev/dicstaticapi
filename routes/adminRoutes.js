const router = require("express").Router();
const { stats } = require("../controllers/adminController");
const { protectAdmin } = require("../middlewares/authMiddleware");

router.get("/stats", protectAdmin, stats);

module.exports = router;