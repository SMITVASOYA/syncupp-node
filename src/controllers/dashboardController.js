const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const { sendResponse } = require("../utils/sendResponse");
const AgencyService = require("../services/agencyService");
const agencyService = new AgencyService();
const ClientService = require("../services/clientService");
const clientService = new ClientService();
const TeamMemberService = require("../services/teamMemberService");
const teamMemberService = new TeamMemberService();
const DashboardService = require("../services/dashboardService");
const dashboardService = new DashboardService();

// Get Dashboard information

exports.dashboardData = catchAsyncError(async (req, res, next) => {
  let dashboardData;
  if (req?.user.role?.name === "agency") {
    dashboardData = await agencyService.dashboardData(req?.user);
  }
  if (req?.user.role?.name === "client") {
    dashboardData = await clientService.dashboardData(req?.user);
  }
  if (req?.user.role?.name === "team_agency") {
    dashboardData = await teamMemberService.dashboardData(req?.user);
  }

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
