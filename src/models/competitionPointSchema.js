const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const competitionPointSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Types.ObjectId },
    agency_id: { type: mongoose.Types.ObjectId },
    role: { type: String },
    point: { type: String },
    type: { type: String, enum: ["task", "login", "referral"] },
    login_date: { type: Date },
  },
  { timestamps: true }
);

const competition_Point = crm_connection.model(
  "competition_Point",
  competitionPointSchema
);
module.exports = competition_Point;
