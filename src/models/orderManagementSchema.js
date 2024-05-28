// this schema is mainly used for the async payment operation
// the issue was when we start the payment inegration we are not able to send the users details
// in the meta data so not getting the details in the webhook
// and need to remove the verify signature flow
const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const orderManagementSchema = new mongoose.Schema(
  {
    subscription_id: { type: String },
    amount: { type: Number },
    currency: { type: String },
    agency_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "authentication",
      required: true,
    },
    email: { type: String },
    contact_number: { type: String },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: "workspaces" },
    order_id: { type: String },
    member_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "authentication",
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Order_Management = crm_connection.model(
  "ordermanagemnt",
  orderManagementSchema
);
module.exports = Order_Management;
