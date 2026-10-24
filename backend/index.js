//index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const slotRoutes = require('./routes/slots'); // ✅ Import the slot routes
const paymentRoutes = require('./routes/payment');

const app = express();

const bookingsRouter = require('./routes/bookings');
const jobRoutes = require('./routes/jobs');

app.use(cors());
app.use(express.json());
app.use('/api', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth', slotRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/bookings', bookingsRouter);
app.use('/api/jobs', jobRoutes);


mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(process.env.PORT, () => console.log(`🚀 Server running on port ${process.env.PORT}`));
  })
  .catch(err => console.error("MongoDB error:", err));
