
require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const User = require("../models/User");
const SlotAvailable = require("../models/SlotAvailable");
const BookedSlot = require("../models/BookedSlot");

const router = express.Router();

const BOOKING_AMOUNT = 4900; // ₹49 in paise
const CURRENCY = "INR";
const FROM_EMAIL = process.env.FROM_EMAIL;
const FROM_NAME = process.env.FROM_NAME || "SBTechWave";

const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
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
    console.error("BREVO BOOKING EMAIL ERROR:", response.status, body);
    throw new Error(`Brevo email failed with status ${response.status}.`);
  }

  return body ? JSON.parse(body) : {};
}

// CREATE RAZORPAY ORDER
router.post("/create-order", async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({
        message: "Razorpay is not configured on the server.",
      });
    }

    const order = await razorpay.orders.create({
      amount: BOOKING_AMOUNT,
      currency: CURRENCY,
      receipt: `interview_${Date.now()}`,
      notes: {
        product: "SBTechWave AI Audio-Based Interview Platform",
      },
    });

    // Return both names for compatibility with the frontend.
    return res.status(200).json({
      success: true,
      id: order.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);
    return res.status(500).json({
      message: "Unable to create payment order.",
    });
  }
});

// VERIFY PAYMENT AND BOOK SLOT
router.post("/verify-payment", async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({
        message: "Razorpay is not configured on the server.",
      });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userEmail,
      date,
      time,
    } = req.body || {};

    // Validate every required field.
    const normalizedEmail =
      typeof userEmail === "string" ? userEmail.trim().toLowerCase() : "";

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !normalizedEmail ||
      !date ||
      !time
    ) {
      console.error("PAYMENT VERIFICATION MISSING FIELDS:", {
        hasOrderId: Boolean(razorpay_order_id),
        hasPaymentId: Boolean(razorpay_payment_id),
        hasSignature: Boolean(razorpay_signature),
        hasEmail: Boolean(normalizedEmail),
        hasDate: Boolean(date),
        hasTime: Boolean(time),
      });

      return res.status(400).json({
        success: false,
        message: "Payment details, user email, date, and time are required.",
      });
    }

    // Validate date format and time string.
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(String(time).trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid interview date or time format.",
      });
    }

    // Verify Razorpay's HMAC signature.
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const supplied = Buffer.from(String(razorpay_signature), "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    if (
      supplied.length !== expected.length ||
      !crypto.timingSafeEqual(supplied, expected)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed.",
      });
    }

    // Confirm the payment directly with Razorpay.
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (
      payment.order_id !== razorpay_order_id ||
      payment.amount !== BOOKING_AMOUNT ||
      payment.currency !== CURRENCY ||
      payment.status !== "captured"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Payment is not captured or payment details do not match. Please contact support if money was deducted.",
      });
    }

    // Ensure the account exists.
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Payment verified, but the user account was not found. Contact support.",
        paymentId: razorpay_payment_id,
      });
    }

    // Idempotency: return the existing booking for a retried payment.
    const existingBooking = await BookedSlot.findOne({
      paymentId: razorpay_payment_id,
    });

    if (existingBooking) {
      return res.status(200).json({
        success: true,
        message: "Payment already verified and interview slot booked.",
        booking: existingBooking,
      });
    }

    // Reserve the slot atomically so concurrent requests cannot book it twice.
    const slotUpdate = await SlotAvailable.updateOne(
      {
        date,
        slots: {
          $elemMatch: {
            time,
            booked: { $ne: true },
          },
        },
      },
      {
        $set: {
          "slots.$.booked": true,
          "slots.$.bookedBy": normalizedEmail,
        },
      }
    );

    if (!slotUpdate.modifiedCount) {
      return res.status(409).json({
        success: false,
        message:
          "Payment was captured, but this slot is no longer available. Contact support with your payment ID.",
        paymentId: razorpay_payment_id,
      });
    }

    let booking;

    try {
      booking = await BookedSlot.create({
        date,
        time,
        user: {
          name: user.name || "",
          email: normalizedEmail,
          phone: user.phone || "",
          college: user.college || "",
        },
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
      });

      user.interviewStatus = "booked";
      user.interviewDate = date;
      user.interviewTime = time;
      await user.save();
    } catch (saveError) {
      console.error("BOOKING SAVE ERROR:", saveError);

      // If the booking was not saved, release the slot only if it
      // is still reserved by this user. Check paymentId before doing so
      // in production if other reservation workflows exist.
      const bookingExists = await BookedSlot.findOne({
        paymentId: razorpay_payment_id,
      });

      if (!bookingExists) {
        await SlotAvailable.updateOne(
          {
            date,
            slots: {
              $elemMatch: {
                time,
                bookedBy: normalizedEmail,
              },
            },
          },
          {
            $set: {
              "slots.$.booked": false,
            },
            $unset: {
              "slots.$.bookedBy": "",
            },
          }
        ).catch((rollbackError) => {
          console.error("SLOT ROLLBACK ERROR:", rollbackError);
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Payment was captured, but booking could not be fully saved. Contact support with your payment ID.",
        paymentId: razorpay_payment_id,
      });
    }

    // Booking is saved; an email failure must not undo it.
    try {
      const safeName = escapeHtml(user.name || "there");
      const safeDate = escapeHtml(date);
      const safeTime = escapeHtml(time);
      const safePaymentId = escapeHtml(razorpay_payment_id);

      await sendBrevoEmail({
        to: normalizedEmail,
        toName: user.name,
        subject: "Your SBTechWave AI Interview booking is confirmed",
        text:
          `Hello ${user.name || "there"},\n\n` +
          "Your interview slot has been booked successfully.\n" +
          `Date: ${date}\n` +
          `Time: ${time}\n` +
          `Payment ID: ${razorpay_payment_id}\n\n` +
          "Thank you,\nSBTechWave",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #ddd;border-radius:12px">
            <h2>Interview Booking Confirmed</h2>
            <p>Hello ${safeName},</p>
            <p>Your AI interview booking with <strong>SBTechWave</strong> is confirmed.</p>
            <div style="padding:16px;background:#f3f4f6;border-radius:8px">
              <p><strong>Date:</strong> ${safeDate}</p>
              <p><strong>Time:</strong> ${safeTime}</p>
              <p><strong>Payment ID:</strong> ${safePaymentId}</p>
            </div>
            <p>Please keep this email for your records.</p>
            <p>Thank you,<br><strong>SBTechWave</strong></p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("BOOKING EMAIL FAILED:", emailError.message);
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified and interview slot booked successfully.",
      booking,
    });
  } catch (error) {
    console.error("VERIFY PAYMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message:
        "Unable to verify payment. If money was deducted, contact support with your Razorpay payment ID.",
    });
  }
});

module.exports = router;
