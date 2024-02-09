const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const AgreementService = require("../services/agreementService");
const { sendResponse } = require("../utils/sendResponse");
const agreementService = new AgreementService();

// -------------------   Agency API   ------------------------

// Add Agreement

exports.addAgreement = catchAsyncError(async (req, res, next) => {
  const addedAgreement = await agreementService.addAgreement(
    req.body,
    req?.user
  );
  sendResponse(
    res,
    true,
    returnMessage("agreement", "agreementAdded"),
    addedAgreement,
    statusCode.success
  );
});

// get All Agreement

exports.getAllAgreement = catchAsyncError(async (req, res, next) => {
  const agreements = await agreementService.getAllAgreement(
    req.body,
    req?.user?._id
  );
  sendResponse(
    res,
    true,
    returnMessage("agreement", "getAllAgreement"),
    agreements,
    statusCode.success
  );
});

// delete Agreement

exports.deleteAgreement = catchAsyncError(async (req, res, next) => {
  await agreementService.deleteAgreement(req.body);
  sendResponse(
    res,
    true,
    returnMessage("agreement", "deleteAgreement"),
    null,
    statusCode.success
  );
});

// Update Agreement

exports.updateAgreement = catchAsyncError(async (req, res, next) => {
  const updatedAgreement = await agreementService.updateAgreement(
    req.body,
    req?.params?.id
  );
  sendResponse(
    res,
    true,
    returnMessage("agreement", "agreementUpdated"),
    updatedAgreement,
    statusCode.success
  );
});

// Get Agreement

exports.getAgreement = catchAsyncError(async (req, res, next) => {
  const getAgreement = await agreementService.getAgreement(req?.params?.id);
  sendResponse(
    res,
    true,
    returnMessage("agreement", "getAgreement"),
    getAgreement,
    statusCode.success
  );
});
// Send Agreement

exports.sendAgreement = catchAsyncError(async (req, res, next) => {
  await agreementService.sendAgreement(req?.body);

  sendResponse(
    res,
    true,
    returnMessage("agreement", "agreementSent"),
    null,
    statusCode.success
  );
});
exports.updateAgreementStatusAgency = catchAsyncError(
  async (req, res, next) => {
    const updatedAgreement = await agreementService.updateAgreementStatusAgency(
      req.body,
      req?.params?.id
    );
    sendResponse(
      res,
      true,
      returnMessage("agreement", "agreementStatusUpdated"),
      updatedAgreement,
      statusCode.success
    );
  }
);

// -------------------   Clint API   ------------------------

// Update Agreement status

exports.updateAgreementStatus = catchAsyncError(async (req, res, next) => {
  const updatedAgreement = await agreementService.updateAgreementStatus(
    req.body,
    req?.params?.id
  );
  sendResponse(
    res,
    true,
    returnMessage("agreement", "agreementStatusUpdated"),
    updatedAgreement,
    statusCode.success
  );
});

exports.downloadPdf = catchAsyncError(async (req, res, next) => {
  const downloadPdf = await agreementService.downloadPdf(req?.params?.id, res);

  sendResponse(
    res,
    true,
    returnMessage("agreement", "downloadPDF"),
    downloadPdf,
    statusCode.success
  );
});

// get All Agreement

exports.getAllClientAgreement = catchAsyncError(async (req, res, next) => {
  const { agreements, pagination } =
    await agreementService.getAllClientAgreement(req.body, req?.user?._id);
  sendResponse(
    res,
    true,
    returnMessage("agreement", "getAllAgreement"),
    agreements,
    statusCode.success,
    pagination
  );
});
