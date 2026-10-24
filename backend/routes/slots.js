//slots.js
const express = require('express');
const router = express.Router();
const SlotAvailable = require('../models/SlotAvailable');

router.get('/slotsavailable', async (req, res) => {
  try {
    const slots = await SlotAvailable.find({});
    res.json(slots);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;