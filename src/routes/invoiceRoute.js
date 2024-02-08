const { protect, authorizeRole } = require("../middlewares/authMiddleware");
const invoiceRoute = require("express").Router();
const invoiceController = require("../controllers/invoiceController");
const { validateCreateInvoice } = require("../validators/invoice.validator");
const validatorFunc = require("../utils/validatorFunction.helper");

invoiceRoute.use(protect);

invoiceRoute.get(
  "/get-clients",
  authorizeRole("agency"),
  invoiceController.getClients
);
invoiceRoute.post("/get-invoice-data", invoiceController.getInvoiceInformation);
invoiceRoute.post(
  "/create-invoice",
  validateCreateInvoice,
  validatorFunc,
  authorizeRole("agency"),
  invoiceController.addInvoice
);
invoiceRoute.post("/get-all", invoiceController.getAllInvoice);
invoiceRoute.get("/:id", invoiceController.getInvoice);
invoiceRoute.delete(
  "/delete-invoice",
  authorizeRole("agency"),
  invoiceController.deleteInvoice
);
invoiceRoute.put(
  "/:id",
  authorizeRole("agency"),
  invoiceController.updateInvoice
);
invoiceRoute.put(
  "/status-update/:id",
  authorizeRole("agency"),
  invoiceController.updateStatusInvoice
);
invoiceRoute.post(
  "/send-invoice",
  authorizeRole("agency"),
  invoiceController.sendInvoice
);
invoiceRoute.post(
  "/download-invoice",
  authorizeRole("agency"),
  invoiceController.downloadPdf
);

module.exports = invoiceRoute;
