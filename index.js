const express = require('express');
const cors = require('cors');
// טוען את המשתנים
require('dotenv').config();

// --- בדיקת משתנים (דיאגנוסטיקה) ---
console.log("--- בדיקת הגדרות ---");
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// מדפיס לטרמינל האם המשתנים קיימים (מסתיר חלק מהם לאבטחה)
console.log("Account SID:", accountSid ? accountSid.substring(0, 6) + "..." : "חסר! (Undefined)");
console.log("Auth Token:", authToken ? "קיים (V)" : "חסר!");

if (!accountSid || !accountSid.startsWith("AC")) {
    console.error("❌ שגיאה קריטית: ה-SID בקובץ .env לא תקין או לא נטען!");
    console.error("וודא שאין רווחים בקובץ .env וששמרת את הקובץ.");
    process.exit(1); // עוצר את השרת כדי שלא יקרוס סתם
}
// ------------------------------------

// אתחול Twilio רק אם הבדיקה עברה
const client = require('twilio')(accountSid, authToken);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const otpStore = {}; 

// === פונקציה לשליחת SMS ===
async function sendSMSOtp(phoneNumber, code) {
    if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
    }

    try {
        console.log(`מנסה לשלוח SMS ל-${phoneNumber}...`);
        
        const message = await client.messages.create({
            body: `Your Sphere verification code is: ${code}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phoneNumber
        });
        
        console.log(`SMS נשלח בהצלחה! SID: ${message.sid}`);
    } catch (error) {
        console.error("Twilio Error:", error.message);
        throw error;
    }
}

// === נתיב 1: בקשת קוד ===
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    otpStore[phone] = code; 
    console.log(`DEBUG: Code for ${phone} is ${code}`);

    setTimeout(() => { delete otpStore[phone] }, 5 * 60 * 1000);

    try {
        await sendSMSOtp(phone, code);
        res.json({ success: true, message: "ה-SMS נשלח בהצלחה" });
    } catch (error) {
        // במקרה של שגיאה (למשל טריאל), נאפשר כניסה דרך הטרמינל
        res.status(500).json({ 
            success: false, 
            message: "שגיאת שליחה. בדוק את הקוד בטרמינל." 
        });
    }
});

// === נתיב 2: אימות קוד ===
app.post('/api/auth/verify-otp', (req, res) => {
    const { phone, code } = req.body;
    if (otpStore[phone] && otpStore[phone] === code) {
        delete otpStore[phone];
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "קוד שגוי" });
    }
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}
module.exports = app;