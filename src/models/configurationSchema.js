const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const configurationSchema = new mongoose.Schema(
  {
    referral: {
      successful_referral_point: { type: Number, default: 500 },
      redeem_required_point: { type: Number, default: 2000 },
    },
    competition: {
      successful_task_competition: { type: Number, default: 20 },
      successful_login: { type: Number, default: 10 },
    },
  },
  { timestamps: true }
);

const Configuration = crm_connection.model(
  "configuration",
  configurationSchema
);
module.exports = Configuration;
