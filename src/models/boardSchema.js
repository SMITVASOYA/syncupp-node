const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const boardSchema = new mongoose.Schema(
  {
    project_name: { type: String, required: true },
    description: { type: String },
    members: [
      {
        member_id: { type: mongoose.Types.ObjectId },
        is_pinned: { type: Boolean, default: false },
      },
    ],
    board_image: { type: String },
    agency_id: { type: mongoose.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

const Board = crm_connection.model("board", boardSchema);

module.exports = Board;
