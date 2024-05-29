const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const taskSchema = new mongoose.Schema(
  {
    title: { type: String },
    workspace_id: { type: mongoose.Types.ObjectId, ref: "workspaces" },
    priority: { type: String, enum: ["high", "low", "medium"] },
    agenda: { type: String },
    due_date: { type: Date },
    due_time: { type: String },
    assign_to: [
      {
        type: mongoose.Types.ObjectId,
        ref: "authentication",
      },
    ],
    assign_by: { type: mongoose.Types.ObjectId, ref: "authentication" },
    agency_id: { type: mongoose.Types.ObjectId, ref: "authentication" },
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
    attachments: [{ type: String }],
    activity_status: {
      type: mongoose.Types.ObjectId,
      ref: "activity_status_master",
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
    mark_as_done: { type: Boolean, default: false },
    competition_point: { type: Number, default: 0 },
    comments: [
      {
        user_id: { type: mongoose.Types.ObjectId, ref: "authentication" },
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

const Task = crm_connection.model("task", taskSchema);
module.exports = Task;
