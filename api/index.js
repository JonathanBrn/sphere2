const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { kv } = require('@vercel/kv');
const twilio = require('twilio');

/* =========================
   בדיקות סביבה (Fail Fast)
========================= */
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_ACCOUNT_SID.startsWith('AC')) {
  throw new Error('❌ TWILIO_ACCOUNT_SID לא תקין');
}
if (!TWILIO_AUTH_TOKEN) {
  throw new Error('❌ TWILIO_AUTH_TOKEN חסר');
}
if (!TWILIO_PHONE_NUMBER) {
  throw new Error('❌ TWILIO_PHONE_NUMBER חסר');
}

/* =========================
   Twilio Client
========================= */
const twilioClient = twilio(
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN
);

/* =========================
   Express App
========================= */
const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   🔥 GUI – חיבור תיקיית public
========================= */
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

/* =========================
   Helpers
========================= */
function normalizePhone(phone) {
  if (!phone.startsWith('+')) {
    return `+${phone}`;
  }
  return phone;
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* =========================
   Send OTP
========================= */
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'חסר מספר טלפון' });
    }

    const normalizedPhone = normalizePhone(phone);
    const code = generateOtp();

    await kv.set(`otp:${normalizedPhone}`, code, { ex: 300 });

    await twilioClient.messages.create({
      body: `Your Sphere verification code is: ${code}`,
      from: TWILIO_PHONE_NUMBER,
      to: normalizedPhone
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
});

/* =========================
   Verify OTP
========================= */
app.post('/api/auth/verify-otp', async (req, res) => {
  const { phone, code } = req.body;

  const normalizedPhone = normalizePhone(phone);
  const storedCode = await kv.get(`otp:${normalizedPhone}`);

  if (storedCode !== code) {
    return res.json({ success: false });
  }

  await kv.del(`otp:${normalizedPhone}`);
  return res.json({ success: true });
});

/* =========================
   GET לבדיקה בדפדפן
========================= */
app.get('/api/auth/send-otp', (req, res) => {
  res.send('OK – use POST to send OTP');
});

module.exports = app;
