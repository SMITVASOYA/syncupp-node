const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const activitySchema = new mongoose.Schema(
  {
    title: { type: String },
    workspace_id: {
      type: mongoose.Types.ObjectId,
      ref: "workspace",
      required: true,
    },
    agenda: { type: String },
    meeting_date: { type: Date },
    internal_info: { type: String },
    google_meet_link: { type: String },
    created_by: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: "authentication",
    },
    meeting_start_time: { type: Date },
    meeting_end_time: { type: Date },
    recurring_end_date: { type: Date },
    all_day: { type: Boolean, default: false },
    alert_time: { type: Number },
    alert_time_unit: {
      type: String,
      enum: ["h", "min"],
    },
    activity_status: {
      type: mongoose.Types.ObjectId,
      ref: "activity_status_master",
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
    attendees: [
      {
        type: mongoose.Types.ObjectId,
        ref: "authentications",
      },
    ],
  },
  { timestamps: true }
);

const Activity = crm_connection.model("activity", activitySchema);
module.exports = Activity;
