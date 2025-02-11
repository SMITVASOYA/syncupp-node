const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const { sendResponse } = require("../utils/sendResponse");
const DashboardService = require("../services/dashboardService");
const dashboardService = new DashboardService();
const AuthService = require("../services/authService");
const authService = new AuthService();

// Get Dashboard information

exports.dashboardData = catchAsyncError(async (req, res, next) => {
  let dashboardData;

  const user_role_data = await authService.getRoleSubRoleInWorkspace(req?.user);
  req.user["role"] = user_role_data?.user_role;
  req.user["sub_role"] = user_role_data?.sub_role;
  dashboardData = await dashboardService.dashboardData(req?.user);

  sendResponse(
    res,
    true,
    returnMessage("agency", "dashboardDataFetched"),
    dashboardData,
    statusCode.success
  );
});

// Get Todays task

exports.todayTask = catchAsyncError(async (req, res, next) => {
  const user_role_data = await authService.getRoleSubRoleInWorkspace(req?.user);
  req.user["role"] = user_role_data?.user_role;
  req.user["sub_role"] = user_role_data?.sub_role;

  const todaysTask = await dashboardService.todayTask(req?.user);

  sendResponse(
    res,
    true,
    returnMessage("agency", "todaysTask"),
    todaysTask,
    statusCode.success
  );
});

// Get Overdue task

exports.overdueTask = catchAsyncError(async (req, res, next) => {
  const overdueTask = await dashboardService.overdueTask(req?.user);

  sendResponse(
    res,
    true,
    returnMessage("agency", "overdueTask"),
    overdueTask,
    statusCode.success
  );
});
// Get Completed task

exports.competedTask = catchAsyncError(async (req, res, next) => {
  const user_role_data = await authService.getRoleSubRoleInWorkspace(req?.user);
  req.user["role"] = user_role_data?.user_role;
  req.user["sub_role"] = user_role_data?.sub_role;
  const competedTask = await dashboardService.completedTask(req?.user);

  sendResponse(
    res,
    true,
    returnMessage("agency", "completedTask"),
    competedTask,
    statusCode.success
  );
});

// // Get

// exports.agencyAffiliate = catchAsyncError(async (req, res, next) => {
//   const agencyAffiliateData = await dashboardService.agencyAffiliate(req?.user);

//   sendResponse(
//     res,
//     true,
//     returnMessage("agency", "affiliateDetailFetched"),
//     agencyAffiliateData,
//     statusCode.success
//   );
// });
