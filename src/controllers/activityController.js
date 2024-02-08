const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const ActivityService = require("../services/activityService");
const { sendResponse } = require("../utils/sendResponse");
const activityService = new ActivityService();

exports.addTask = catchAsyncError(async (req, res, next) => {
  const createTask = await activityService.createTask(req.body, req?.user?._id);
  sendResponse(
    res,
    true,
    returnMessage("activity", "createTask"),
    createTask,
    statusCode.success
  );
});

exports.statusList = catchAsyncError(async (req, res, next) => {
  const statusList = await activityService.activityStatus();
  sendResponse(
    res,
    true,
    returnMessage("activity", "statusList"),
    statusList,
    statusCode.success
  );
});

exports.taskList = catchAsyncError(async (req, res, next) => {
  let taskList;
  if (req?.user?.role?.name === "agency") {
    taskList = await activityService.taskList(req.body, req.user);
  } else if (req?.user?.role?.name === "client") {
    taskList = await activityService.clientTaskList(req.body, req.user);
  } else if (req?.user?.role?.name === "team_agency") {
    taskList = await activityService.teamAdminTaskList(req.body, req.user);
  }
  sendResponse(
    res,
    true,
    returnMessage("activity", "taskList"),
    taskList,
    statusCode.success
  );
});

exports.fetchTask = catchAsyncError(async (req, res, next) => {
  const fetchTask = await activityService.getTaskById(req?.params?.id);
  sendResponse(
    res,
    true,
    returnMessage("activity", "fetchTask"),
    fetchTask,
    statusCode.success
  );
});
exports.updateTask = catchAsyncError(async (req, res, next) => {
  const updateTask = await activityService.updateTask(
    req.body,
    req?.params?.id
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "updateTask"),
    updateTask,
    statusCode.success
  );
});
exports.deleteTask = catchAsyncError(async (req, res, next) => {
  const deleteTask = await activityService.deleteTask(req?.body);
  sendResponse(
    res,
    true,
    returnMessage("activity", "deleteTask"),
    deleteTask,
    statusCode.success
  );
});

exports.updateStatus = catchAsyncError(async (req, res, next) => {
  const updateStatus = await activityService.statusUpdate(
    req?.body,
    req.params.id
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "updateStatus"),
    updateStatus,
    statusCode.success
  );
});
