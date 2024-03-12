const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const invoiceSchema = new mongoose.Schema(
  {
    invoice_number: { type: String, required: true },
    client_id: { type: mongoose.Types.ObjectId, ref: "client", required: true },
    due_date: { type: Date, required: true },
    invoice_date: { type: Date, required: true },
    status: {
      type: mongoose.Types.ObjectId,
      ref: "invoice_status_master",
      required: true,
    },
    agency_id: {
      type: mongoose.Types.ObjectId,
      ref: "agency",
      required: true,
    },

    currency: {
      type: mongoose.Types.ObjectId,
      ref: "currency",
      required: true,
    },
    memo: {
      type: String,
    },
    invoice_content: [
      {
        item: {
          type: String,
          required: true,
        },
        qty: {
          type: Number,
          required: true,
          min: 1,
        },
        rate: {
          type: Number,
          required: true,
          min: 0,
        },
        tax: {
          type: Number,
          required: true,
          min: 0,
        },
        amount: {
          type: Number,
          required: true,
          min: 0,
        },
        description: {
          type: String,
          required: true,
        },
      },
    ],
    is_deleted: {
      type: Boolean,
      default: false,
    },
    sub_total: {
      required: true,
      type: Number,
    },
    total: {
      required: true,
      type: Number,
    },
  },
  { timestamps: true }
);

const Invoice = crm_connection.model("invoice", invoiceSchema);

module.exports = Invoice;
