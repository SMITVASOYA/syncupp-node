const settingRoute = require("express").Router();
const invoiceController = require("../controllers/invoiceController");
const { protect } = require("../middlewares/authMiddleware");

settingRoute.use(protect);

settingRoute.post("/upload-logo", invoiceController.uploadLogo);
settingRoute.get("/get-setting", invoiceController.getSetting);

module.exports = settingRoute;
