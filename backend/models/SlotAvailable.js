
//models/SlotAvailable.js
const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  time: String,
  booked: { type: Boolean, default: false }
});

const slotAvailableSchema = new mongoose.Schema({
  date: String,
  slots: [slotSchema]
}, { collection: 'slotsavailable' }); // ✅ Fixed typo in collection name

module.exports = mongoose.model('SlotAvailable', slotAvailableSchema);