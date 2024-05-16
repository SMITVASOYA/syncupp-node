const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const activitySchema = new mongoose.Schema(
  {
    activity_type: {
      type: mongoose.Types.ObjectId,
      ref: "activity_type_master",
      required: true,
    },
    title: { type: String },
    workspace_id: { type: mongoose.Types.ObjectId },
    priority: {
      type: String,
      enum: ["high", "low", "medium"],
    },
    agenda: { type: String },
    due_date: { type: Date },
    due_time: { type: String },
    internal_info: { type: String },
    assign_to: [
      {
        type: mongoose.Types.ObjectId,
      },
    ],
    assign_by: { type: mongoose.Types.ObjectId },
    agency_id: { type: mongoose.Types.ObjectId },
    status_history: [
      {
        status: {
          type: mongoose.Types.ObjectId,
        },
        active: {
          default: 0,
          type: Number,
        },
      },
    ],
    meeting_start_time: { type: Date },
    meeting_end_time: { type: Date },
    recurring_end_date: { type: Date },
    attachments: [
      {
        type: String,
      },
    ],
    activity_status: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
    mark_as_done: { type: Boolean, default: false },
    competition_point: { type: Number, default: 0 },
    attendees: [{ type: mongoose.Types.ObjectId }],
    comments: [
      {
        user_id: { type: mongoose.Types.ObjectId },
        comment: { type: String },
      },
    ],
    board_id: {
      type: mongoose.Types.ObjectId,
      ref: "board",
      required: true,
    },
  },
  { timestamps: true }
);

const Activity = crm_connection.model("activity", activitySchema);
module.exports = Activity;
