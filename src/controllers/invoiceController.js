const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const InvoiceService = require("../services/invoiceService");
const { sendResponse } = require("../utils/sendResponse");
const invoiceService = new InvoiceService();

// Add Clients ------   AGENCY API

exports.getClients = catchAsyncError(async (req, res, next) => {
  const getClients = await invoiceService.getClients(req?.user);
  sendResponse(
    res,
    true,
    returnMessage("invoice", "clientFetched"),
    getClients,
    statusCode.success
  );
});

// Get InvoiceInformation ------   AGENCY API

exports.getInvoiceInformation = catchAsyncError(async (req, res, next) => {
  const getClientData = await invoiceService.getInvoiceInformation(
    req?.body,
    req?.user
  );
  sendResponse(
    res,
    true,
    returnMessage("invoice", "invoiceInfo"),
    getClientData,
    statusCode.success
  );
});

// Add Invoice ------   AGENCY API

exports.addInvoice = catchAsyncError(async (req, res, next) => {
  const addedInvoice = await invoiceService.addInvoice(req.body, req?.user);
  sendResponse(
    res,
    true,
    returnMessage("invoice", "invoiceCreated"),
    addedInvoice,
    statusCode.success
  );
});

// get All Invoice ------   AGENCY API AND CLIENT API --------------------------------

exports.getAllInvoice = catchAsyncError(async (req, res, next) => {
  let invoicesList;
  if (req.user.role.name === "agency") {
    invoicesList = await invoiceService.getAllInvoice(
      req.body,
      req?.user?.reference_id
    );
  } else if (req.user.role.name === "client") {
    invoicesList = await invoiceService.getClientInvoice(
      req.body,
      req?.user?.reference_id
    );
  }

  sendResponse(
    res,
    true,
    returnMessage("invoice", "getAllInvoices"),
    invoicesList,
    statusCode.success
  );
});

// Get Invoice     ------   AGENCY API / Client API

exports.getInvoice = catchAsyncError(async (req, res, next) => {
  const getInvoice = await invoiceService.getInvoice(req?.params?.id);

  sendResponse(
    res,
    true,
    returnMessage("invoice", "getAllInvoices"),
    getInvoice,
    statusCode.success
  );
});

// delete Invoice ------   AGENCY API

exports.deleteInvoice = catchAsyncError(async (req, res, next) => {
  await invoiceService.deleteInvoice(req?.body);
  sendResponse(
    res,
    true,
    returnMessage("invoice", "invoiceDeleted"),
    null,
    statusCode.success
  );
});

// Update Invoice  ------   Agency API

exports.updateInvoice = catchAsyncError(async (req, res, next) => {
  await invoiceService.updateInvoice(req.body, req?.params?.id);
  sendResponse(
    res,
    true,
    returnMessage("invoice", "invoiceUpdated"),
    null,
    statusCode.success
  );
});

// Update Status Invoice Status ------   Agency API

exports.updateStatusInvoice = catchAsyncError(async (req, res, next) => {
  await invoiceService.updateStatusInvoice(req.body, req?.params?.id);
  sendResponse(
    res,
    true,
    returnMessage("invoice", "invoiceStatusUpdated"),
    null,
    statusCode.success
  );
});

// Send Invoice By mail------   Agency API

exports.sendInvoice = catchAsyncError(async (req, res, next) => {
  await invoiceService.sendInvoice(req.body);
  sendResponse(
    res,
    true,
    returnMessage("invoice", "invoiceSent"),
    null,
    statusCode.success
  );
});

// Download PDF

exports.downloadPdf = catchAsyncError(async (req, res, next) => {
  if (req.user?.role?.name === "agency" || req.user?.role?.name === "client") {
    var downloadPdf = await invoiceService.downloadPdf(req?.params, res);
  }

  sendResponse(
    res,
    true,
    returnMessage("invoice", "downloadPDF"),
    downloadPdf,
    statusCode.success
  );
});
