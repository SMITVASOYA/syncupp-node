const mongoose = require("mongoose");
const { admin_connection } = require("../config/connection");

const ticketSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
    },
    contact_number: {
      type: String,
      required: true,
    },
    ticket_detail: {
      type: String,
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Ticket = admin_connection.model("ticket", ticketSchema);
module.exports = Ticket;
