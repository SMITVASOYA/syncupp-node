const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const boardSchema = new mongoose.Schema(
  {
    project_name: { type: String, required: true },
    description: { type: String, required: true },
    members: [{ type: mongoose.Types.ObjectId, required: true }],
    board_image: { type: String, required: true },
    is_pinned: { type: Boolean, default: false },
    agency_id: { type: mongoose.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

const Board = crm_connection.model("board", boardSchema);

module.exports = Board;
