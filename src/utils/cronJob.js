const cron = require("node-cron");
const InvoiceService = require("../services/invoiceService");
const invoiceService = new InvoiceService();

const Invoice = require("../models/invoiceSchema");
const Invoice_status_master = require("../models/masters/invoiceStatusMaster");
async function updateOverdueStatus() {
  try {
    // Find invoices with due dates that have passed
    const currentDate = new Date();
    const overdue = await Invoice_status_master.findOne({ name: "overdue" });
    const paid = await Invoice_status_master.findOne({ name: "paid" });
    const overdueInvoices = await Invoice.find({
      due_date: { $lt: currentDate },
      status: { $nin: [overdue._id, paid._id] },
    });

    // Update status to "overdue" for each overdue invoice
    const overdueStatus = await Invoice_status_master.findOne({
      name: "overdue",
    });
    for (const invoice of overdueInvoices) {
      invoice.status = overdueStatus._id;
      await invoice.save();
    }

    console.log("Updated overdue statuses successfully");
  } catch (error) {
    console.error("Error updating overdue statuses:", error);
  }
}

exports.setupNightlyCronJob = () => {
  // Schedule the cron job to run every night at 12 (0 hours)
  cron.schedule("0 0 * * *", () => {
    console.log("Running the nightly cron job...");
    invoiceService.overdueCronJob();
  });
};
