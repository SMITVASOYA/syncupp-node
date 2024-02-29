const dashboardRoute = require("express").Router();
const dashboardController = require("../controllers/dashboardController");
const { protect } = require("../middlewares/authMiddleware");

dashboardRoute.use(protect);
dashboardRoute.get("/", dashboardController.dashboardData);

module.exports = dashboardRoute;
