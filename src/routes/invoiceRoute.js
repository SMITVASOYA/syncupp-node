const { protect, authorizeRole } = require("../middlewares/authMiddleware");
const invoiceRoute = require("express").Router();
const invoiceController = require("../controllers/invoiceController");
const { validateCreateInvoice } = require("../validators/invoice.validator");
const validatorFunc = require("../utils/validatorFunction.helper");

invoiceRoute.post("/add-currency", invoiceController.addCurrency);
invoiceRoute.get("/currency", invoiceController.currencyList);

invoiceRoute.use(protect);

invoiceRoute.get("/get-clients", invoiceController.getClients);
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
invoiceRoute.get(
  "/download-invoice/:invoice_id",
  invoiceController.downloadPdf
);

module.exports = invoiceRoute;
