const {
  protect,
  authorizeMultipleRoles,
} = require("../middlewares/authMiddleware");
const taskController = require("../controllers/taskController");
const { upload, checkFileSize } = require("../helpers/multer");
const taskRoute = require("express").Router();
taskRoute.use(protect);

// Task
taskRoute.post(
  "/create-task",
  authorizeMultipleRoles(["agency", "team_agency"]),
  checkFileSize,
  upload.array("attachments"),
  taskController.addTask
);
taskRoute.post("/task-list", taskController.taskList);
taskRoute.get("/get-task/:id", taskController.fetchTask);
taskRoute.delete(
  "/delete-task",
  authorizeMultipleRoles(["agency", "team_agency"]),
  taskController.deleteTask
);
taskRoute.put(
  "/update-task/:id",
  authorizeMultipleRoles(["agency", "team_agency"]),
  checkFileSize,
  upload.array("attachments"),
  taskController.updateTask
);
taskRoute.post(
  "/add-comment",
  authorizeMultipleRoles(["agency", "team_agency"]),
  taskController.addTaskComment
);
taskRoute.get("/list-comments/:task_id", taskController.listTaskComment);
taskRoute.post(
  "/leave-task",
  authorizeMultipleRoles(["agency", "team_agency"]),
  taskController.leaveTask
);
taskRoute.put(
  "/update-status/:id",
  authorizeMultipleRoles(["agency", "team_agency"]),
  taskController.updateTaskStatus
);

module.exports = taskRoute;
