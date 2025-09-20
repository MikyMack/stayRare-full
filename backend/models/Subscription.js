const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  subscription: { type: Object, required: true }
}, { timestamps: true });

module.exports = mongoose.model("Subscription", subscriptionSchema);
