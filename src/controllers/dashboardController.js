const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const { sendResponse } = require("../utils/sendResponse");
const AgencyService = require("../services/agencyService");
const agencyService = new AgencyService();

// Get Dashboard information

exports.dashboardData = catchAsyncError(async (req, res, next) => {
  const agency = await agencyService.dashboardData(req?.user);

  sendResponse(
    res,
    true,
    returnMessage("agency", "dashboardDataFetched"),
    agency,
    statusCode.success
  );
});
