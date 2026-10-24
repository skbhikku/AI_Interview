
const mongoose = require("mongoose");

const bookedSlotSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    time: {
      type: String,
      required: true,
      trim: true,
    },
    user: {
      name: {
        type: String,
        default: "",
      },
      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },
      phone: {
        type: String,
        default: "",
      },
      college: {
        type: String,
        default: "",
      },
    },
    paymentId: {
      type: String,
      required: true,
      unique: true,
    },
    orderId: {
      type: String,
      required: true,
    },
    bookedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "bookedslots",
    timestamps: false,
  }
);

module.exports = mongoose.model("BookedSlot", bookedSlotSchema);
