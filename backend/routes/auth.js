// auth.js
require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const User = require("../models/User");
const Otp = require("../models/Otp");
const SlotAvailable = require("../models/SlotAvailable");
const BookedSlot = require("../models/BookedSlot");
const Job = require("../models/Job");

const router = express.Router();
const FROM_EMAIL = process.env.FROM_EMAIL;
const FROM_NAME = process.env.FROM_NAME || "SBTechWave";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function hashPassword(password) {
  return bcrypt.hash(password + process.env.PEPPER, 10);
}

async function sendBrevoEmail({ to, toName, subject, text, html }) {
  if (!process.env.BREVO_API_KEY || !FROM_EMAIL) {
    throw new Error("Missing BREVO_API_KEY or FROM_EMAIL.");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to, ...(toName ? { name: toName } : {}) }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    console.error("BREVO EMAIL ERROR:", response.status, body);
    throw new Error(`Brevo rejected the email request (${response.status}).`);
  }

  return body ? JSON.parse(body) : {};
}

// REGISTER + SEND EMAIL OTP
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, college } = req.body;

    if (!name || !email || !password || !college) {
      return res.status(400).json({
        message: "Please fill in all required fields."
      });
    }

    if (
      !process.env.BREVO_API_KEY ||
      !FROM_EMAIL ||
      !process.env.PEPPER
    ) {
      console.error("Missing BREVO_API_KEY, FROM_EMAIL, or PEPPER.");
      return res.status(500).json({
        message: "Server email configuration is incomplete."
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    const user = new User({
      name: String(name).trim(),
      email: normalizedEmail,
      password: await hashPassword(password),
      college: String(college).trim(),
      isVerified: false,
    });

    await user.save();

    const otp = String(crypto.randomInt(100000, 1000000));

    try {
      await Otp.deleteMany({ email: normalizedEmail });

      await new Otp({
        email: normalizedEmail,
        otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      }).save();

      const safeName = escapeHtml(name);

      await sendBrevoEmail({
        to: normalizedEmail,
        toName: String(name).trim(),
        subject: "Your SBTechWave AI Interview verification code",
        text:
          `Hello ${name},\n\n` +
          `Your SBTechWave AI Audio-Based Interview Platform ` +
          `verification code is ${otp}.\n\n` +
          "This code expires in 10 minutes. " +
          "If you did not request it, please ignore this email.",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #ddd;border-radius:12px">
            <h2>Welcome to SBTechWave</h2>
            <p>Hello ${safeName},</p>
            <p>Use this code to verify your email for the AI Audio-Based Interview Platform:</p>
            <div style="font-size:30px;font-weight:bold;letter-spacing:8px;padding:16px;background:#f3f4f6;text-align:center;border-radius:8px">${otp}</div>
            <p>This code expires in <strong>10 minutes</strong>.</p>
            <p>If you did not request this code, please ignore this email.</p>
            <p style="color:#666;font-size:12px">SBTechWave · AI Audio-Based Interview Platform</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("OTP EMAIL ERROR:", emailError.message);
      await Otp.deleteMany({ email: normalizedEmail });
      await User.deleteOne({
        _id: user._id,
        isVerified: false
      });

      return res.status(502).json({
        message: "Could not send verification email. Please try again later."
      });
    }

    return res.status(201).json({
      message: "Verification code sent. Please check your email."
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error.message);
    return res.status(500).json({
      message: "Registration failed. Please try again."
    });
  }
});

// VERIFY OTP

router.post("/verify-otp", async (req, res) => {
  try {
    console.log("VERIFY OTP BODY:", {
      bodyIsObject: !!req.body && typeof req.body === "object",
      hasEmail: !!req.body?.email,
      hasOtp: !!req.body?.otp,
      receivedKeys: Object.keys(req.body || {})
    });

    const { email, otp } = req.body || {};

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP are required."
      });
    }


    const normalizedEmail = String(email).trim().toLowerCase();

    const otpRecord = await Otp.findOne({
      email: normalizedEmail,
      otp: String(otp).trim()
    });

    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    if (new Date(otpRecord.expiresAt).getTime() < Date.now()) {
      await Otp.deleteMany({ email: normalizedEmail });
      return res.status(400).json({
        message: "OTP expired. Please register again."
      });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.isVerified = true;
    await user.save();
    await Otp.deleteMany({ email: normalizedEmail });

    return res.status(200).json({
      message: "Email verified successfully."
    });
  } catch (error) {
    console.error("OTP VERIFICATION ERROR:", error.message);
    return res.status(500).json({
      message: "OTP verification failed."
    });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const user = await User.findOne({
      email: String(email).trim().toLowerCase()
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const matches = await bcrypt.compare(
      password + process.env.PEPPER,
      user.password
    );

    if (!matches) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    if (user.isVerified === false) {
      return res.status(403).json({
        message: "Please verify your email before logging in."
      });
    }

    const userData = user.toObject();
    delete userData.password;

    return res.status(200).json({
      message: "Login successful.",
      user: userData
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error.message);
    return res.status(500).json({ message: "Login failed." });
  }
});

// UPDATE USER DETAILS
router.put("/update", async (req, res) => {
  try {
    const { email, name, college } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required."
      });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (college !== undefined) updates.college = college;

    const user = await User.findOneAndUpdate(
      { email: String(email).trim().toLowerCase() },
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({
      message: "User updated successfully.",
      user
    });
  } catch (error) {
    console.error("UPDATE USER ERROR:", error.message);
    return res.status(500).json({
      message: "Unable to update user."
    });
  }
});

// CHANGE PASSWORD
router.post("/change-password", async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Please provide all password fields."
      });
    }

    if (!process.env.PEPPER) {
      return res.status(500).json({
        message: "Server configuration error."
      });
    }

    const user = await User.findOne({
      email: String(email).trim().toLowerCase()
    });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const matches = await bcrypt.compare(
      currentPassword + process.env.PEPPER,
      user.password
    );

    if (!matches) {
      return res.status(400).json({
        message: "Current password is incorrect."
      });
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    return res.status(200).json({
      message: "Password changed successfully."
    });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error.message);
    return res.status(500).json({
      message: "Unable to change password."
    });
  }
});

// GET AVAILABLE SLOTS
router.get("/slotsavailable", async (req, res) => {
  try {
    return res.status(200).json(await SlotAvailable.find());
  } catch (error) {
    console.error("GET SLOTS ERROR:", error.message);
    return res.status(500).json({
      message: "Unable to fetch available slots."
    });
  }
});

// GET JOBS
router.get("/getjobs", async (req, res) => {
  try {
    return res.status(200).json(await Job.find());
  } catch (error) {
    console.error("GET JOBS ERROR:", error.message);
    return res.status(500).json({
      message: "Unable to fetch jobs."
    });
  }
});

// GET USERS WITHOUT PASSWORD HASHES
router.get("/users", async (req, res) => {
  try {
    return res.status(200).json(
      await User.find().select("-password")
    );
  } catch (error) {
    console.error("GET USERS ERROR:", error.message);
    return res.status(500).json({
      message: "Unable to fetch users."
    });
  }
});

// GET BOOKED SLOTS
router.get("/bookedslots", async (req, res) => {
  try {
    return res.status(200).json(await BookedSlot.find());
  } catch (error) {
    console.error("GET BOOKINGS ERROR:", error.message);
    return res.status(500).json({
      message: "Unable to fetch bookings."
    });
  }
});

// GET A USER'S BOOKING
router.get("/:email", async (req, res) => {
  try {
    const email = String(req.params.email).trim().toLowerCase();
    const booking = await BookedSlot.findOne({
      "user.email": email
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found."
      });
    }

    return res.status(200).json(booking);
  } catch (error) {
    console.error("GET USER BOOKING ERROR:", error.message);
    return res.status(500).json({
      message: "Unable to fetch booking."
    });
  }
});

module.exports = router;
