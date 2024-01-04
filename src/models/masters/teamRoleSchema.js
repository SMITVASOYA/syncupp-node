const mongoose = require("mongoose");
const { crm_connection } = require("../../config/connection");

const teamRoleMasterSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["team_member", "admin"],
    },
  },
  { timestamps: true }
);

const Team_Role_Master = crm_connection.model(
  "team_role_master",
  teamRoleMasterSchema
);

module.exports = Team_Role_Master;
