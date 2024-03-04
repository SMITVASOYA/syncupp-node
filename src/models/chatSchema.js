const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const chat_schema = new mongoose.Schema(
  {
    from_user: { type: mongoose.Schema.Types.ObjectId, required: true },
    to_user: { type: mongoose.Schema.Types.ObjectId, required: true },
    message: { type: String },
    is_deleted: { type: Boolean, default: false },
    image_url: { type: String },
    document_url: { type: String },
  },
  { timestamps: true }
);

const Chat = crm_connection.model("chat", chat_schema);
module.exports = Chat;
