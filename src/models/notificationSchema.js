const mongoose = require("mongoose");
const { crm_connection } = require("../config/connection");

const notificationSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Types.ObjectId },
    type: {
      type: String,
      enum: [
        "chat",
        " ",
        "invoice",
        "agreement",
        "task",
        "activity",
        "deleted",
        "general",
<<<<<<< HEAD
        "agency",
=======
        "group",
>>>>>>> 44b30a146ee8162f1642ec4e0785e3a5d0cc09fb
      ],
    },
    data_reference_id: { type: mongoose.Types.ObjectId },
    message: { type: String },
    is_read: { type: Boolean, default: false },
    is_deleted: { type: Boolean, default: false },
    from_user: { type: mongoose.Types.ObjectId },
    user_type: { type: String },
    group_id: { type: mongoose.Types.ObjectId },
  },
  { timestamps: true }
);

const Notification = crm_connection.model("notification", notificationSchema);

module.exports = Notification;
