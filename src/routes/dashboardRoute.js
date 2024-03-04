const dashboardRoute = require("express").Router();
const dashboardController = require("../controllers/dashboardController");
const { protect } = require("../middlewares/authMiddleware");

dashboardRoute.use(protect);
dashboardRoute.get("/", dashboardController.dashboardData);
dashboardRoute.get("/todays-task", dashboardController.todayTask);
dashboardRoute.get("/overdue-task", dashboardController.overdueTask);

module.exports = dashboardRoute;
