// const express = require('express');
// const router = express.Router();
// const BookedSlot = require('../models/BookedSlot');

// // Get user booking endpoint
// router.get('/:email', async (req, res) => {
//   try {
//     const email = req.params.email;
//     // Find the latest booking for the user by matching user.email
//     const booking = await BookedSlot.findOne({ 'user.email': email }).sort({ bookedAt: -1 }).lean();

//     if (!booking) {
//       return res.status(404).json({ error: 'No booking found' });
//     }

//     // Send back relevant booking info
//     res.json({
//       slot: {
//         date: booking.date,
//         time: booking.time,
//         status: 'Booked',
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching booking:', error);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// module.exports = router;


const express = require('express');
const router = express.Router();
const BookedSlot = require('../models/BookedSlot');

// Get all bookings by user email
router.get('/:email', async (req, res) => {
  try {
    const bookings = await BookedSlot.find({ 'user.email': req.params.email }).sort({ bookedAt: -1 });

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ error: 'No bookings found' });
    }

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
