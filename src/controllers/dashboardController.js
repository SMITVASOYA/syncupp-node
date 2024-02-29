const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const { sendResponse } = require("../utils/sendResponse");
const AgencyService = require("../services/agencyService");
const agencyService = new AgencyService();
const ClientService = require("../services/clientService");
const clientService = new ClientService();

// Get Dashboard information

exports.dashboardData = catchAsyncError(async (req, res, next) => {
  let dashboardData;
  if (req?.user.role?.name === "agency") {
    dashboardData = await agencyService.dashboardData(req?.user);
  }
  if (req?.user.role?.name === "client") {
    dashboardData = await clientService.dashboardData(req?.user);
  }

  sendResponse(
    res,
    true,
    returnMessage("agency", "dashboardDataFetched"),
    dashboardData,
    statusCode.success
  );
});
