const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const sectionSchema = new mongoose.Schema(
  {
    board_id: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    section_name: {
      type: String,
      required: true,
    },
    sort_order: {
      type: Number,
      required: true,
    },
    color: {
      type: String,
      required: true,
    },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Section = crm_connection.model("section", sectionSchema);
module.exports = Section;
