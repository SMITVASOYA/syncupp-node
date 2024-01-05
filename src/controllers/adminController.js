const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const AdminService = require("../services/adminService");
const { sendResponse } = require("../utils/sendResponse");
const adminService = new AdminService();

exports.login = catchAsyncError(async (req, res, next) => {
  const admin = await adminService.login(req.body);
  sendResponse(
    res,
    true,
    returnMessage("admin", "loggedIn"),
    admin,
    statusCode.success
  );
});

// getUsers

exports.getAdmins = catchAsyncError(async (req, res, next) => {
  const admin = await adminService.getAdmins();
  if (admin) {
    sendResponse(
      res,
      true,
      `Users fetched successfully `,
      admin,
      statusCode.success
    );
  }
});

// forgotPassword
exports.forgotPassword = catchAsyncError(async (req, res, next) => {
  const admin = await adminService.forgotPassword(req.body);

  sendResponse(
    res,
    true,
    returnMessage("admin", "emailSent"),
    admin,
    statusCode.success
  );
});

// resetPassword

exports.resetPassword = catchAsyncError(async (req, res, next) => {
  await adminService.resetPassword(req.body);

  sendResponse(
    res,
    true,
    returnMessage("admin", "resetPassword"),
    null,
    statusCode.success
  );
});

//Update password

exports.changePassword = catchAsyncError(async (req, res, next) => {
  await adminService.changePassword(req.body);

  sendResponse(
    res,
    true,
    returnMessage("admin", "passwordUpdated"),
    null,
    statusCode.success
  );
});

//  Get All Team Member

exports.updateAdmin = catchAsyncError(async (req, res, next) => {
  const admin = await adminService.updateAdmin(req.body, req?.user?._id);
  sendResponse(
    res,
    true,
    returnMessage("admin", "updated"),
    admin,
    statusCode.success
  );
});

// Add FAQ

exports.addFaq = catchAsyncError(async (req, res, next) => {
  const addedFaq = await adminService.addFaq(req.body);
  sendResponse(
    res,
    true,
    returnMessage("admin", "faqAdded"),
    addedFaq,
    statusCode.success
  );
});

// get All FQA

exports.getAllFaq = catchAsyncError(async (req, res, next) => {
  const allFaq = await adminService.getAllFaq();
  sendResponse(
    res,
    true,
    returnMessage("admin", "getAllFaq"),
    allFaq,
    statusCode.success
  );
});

// delete FQA

exports.deleteFaq = catchAsyncError(async (req, res, next) => {
  await adminService.deleteFaq(req?.body);
  sendResponse(
    res,
    true,
    returnMessage("admin", "deleteFaq"),
    null,
    statusCode.success
  );
});

// Update FQA

exports.updateFaq = catchAsyncError(async (req, res, next) => {
  const updatedFaq = await adminService.updateFaq(req.body, req?.params?.id);
  sendResponse(
    res,
    true,
    returnMessage("admin", "faqUpdated"),
    updatedFaq,
    statusCode.success
  );
});
