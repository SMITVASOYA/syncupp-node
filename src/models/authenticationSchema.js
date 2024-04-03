const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const authenticationSchema = new mongoose.Schema(
  {
    first_name: { type: String },
    last_name: { type: String },
    name: { type: String },
    email: { type: String, required: true },
    password: { type: String },
    contact_number: { type: String },
    is_google_signup: { type: Boolean, default: false },
    is_facebook_signup: { type: Boolean, default: false },
    reset_password_token: { type: String },
    invitation_token: { type: String },
    remember_me: { type: Boolean, default: false },
    is_deleted: { type: Boolean, default: false },
    profile_image: { type: String },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "role_master",
      required: true,
    },
    reference_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    image_url: { type: String },
    status: {
      type: String,
      enum: [
        "free_trial",
        "payment_pending",
        "payment_done",
        "confirmed",
        "confirm_pending",
        "agency_inactive",
        "team_agency_inactive",
        "subscription_halted",
        "subscription_cancelled",
      ],
      default: "free_trial",
    },
    subscription_id: { type: String },
    subscribe_date: { typr: String },
    order_id: { type: String },
    referral_code: { type: String },
    affiliate_referral_code: { type: String },
    last_login_date: { type: Date },
    click_count: { type: Number, default: 0 },
    is_online: { type: Boolean, default: false },
    subscription_halted: { type: Date },
    subscription_halted_displayed: { type: Boolean, default: false },
    purchased_plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "subscription_plan",
    },
  },
  { timestamps: true }
);

const Authentication = crm_connection.model(
  "authentication",
  authenticationSchema
);

module.exports = Authentication;
