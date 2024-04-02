const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    period: { type: String, default: "monthly", enum: ["monthly", "yearly"] },
    amount: { type: Number, required: true },
    description: { type: String },
    currency: {
      type: String,
      required: true,
      enum: ["USD", "INR"],
      default: "USD",
    },
    plan_id: { type: String, required: true },
    active: { type: Boolean, default: false },
    symbol: { type: String },
    seat: { type: Number, default: 1 },
    sort_value: { type: Number },
  },
  { timestamps: true }
);

const SubscriptionPlan = crm_connection.model(
  "subscription_plan",
  subscriptionPlanSchema
);

module.exports = SubscriptionPlan;
