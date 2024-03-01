const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const referralHistorySchema = new mongoose.Schema(
  {
    referral_code: {
      type: String,
      required: true,
    },
    referred_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "authentication",
      required: true,
    },
    referred_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "authentication",
    },
    email: { type: String },
    registered: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const ReferralHistory = crm_connection.model(
  "Referral_history",
  referralHistorySchema
);

module.exports = ReferralHistory;
