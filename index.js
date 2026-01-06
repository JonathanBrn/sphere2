const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// --- אתחול Twilio (רק אם המפתחות קיימים) ---
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
let client;

if (accountSid && authToken && accountSid.startsWith('AC')) {
    client = require('twilio')(accountSid, authToken);
} else {
    console.warn("⚠️ Twilio credentials missing or invalid. SMS will not be sent (check logs for codes).");
}

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === תיקון קריטי ל-Vercel ===
// שימוש ב-process.cwd() מבטיח ש-Vercel ימצא את תיקיית ה-public
app.use(express.static(path.join(process.cwd(), 'public')));

// "מסד נתונים" זמני בזיכרון
const otpStore = {}; 

// === פונקציית עזר לשליחת SMS ===
async function sendSMSOtp(phoneNumber, code) {
    if (!client) throw new Error("Twilio client not initialized");
    
    // Twilio חייב פורמט בינלאומי עם פלוס (+972...)
    if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
    }

    console.log(`Sending SMS to ${phoneNumber}...`);
    
    const message = await client.messages.create({
        body: `Your Sphere verification code is: ${code}`,
        from: process.env.TWILIO_PHONE_NUMBER, // המספר האמריקאי שלך
        to: phoneNumber
    });
    
    console.log(`SMS sent successfully! SID: ${message.sid}`);
}

// === נתיב 1: בקשת קוד ===
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    
    // יצירת קוד רנדומלי (6 ספרות)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // שמירה בזיכרון
    otpStore[phone] = code; 
    
    // מחיקה אוטומטית אחרי 5 דקות
    setTimeout(() => { delete otpStore[phone] }, 5 * 60 * 1000);

    // === הדפסה ללוגים (חובה לפיתוח!) ===
    // את זה תראה ב-Logs של Vercel אם ה-SMS לא מגיע
    console.log(`DEBUG CODE for ${phone}: [ ${code} ]`);

    try {
        if (client) {
            await sendSMSOtp(phone, code);
        }
        // מחזירים תמיד הצלחה, כדי שהמשתמש יעבור מסך
        // (במקרה הגרוע הוא ייקח את הקוד מהלוגים)
        res.json({ success: true, message: "תהליך השליחה הושלם" });
    } catch (error) {
        console.error("Twilio Error:", error.message);
        // עדיין מחזירים הצלחה לצד הלקוח כדי לא לתקוע את האפליקציה
        res.json({ success: true, message: "נשלח (בדוק לוגים למקרה של תקלה)" });
    }
});

// === נתיב 2: אימות קוד ===
app.post('/api/auth/verify-otp', (req, res) => {
    const { phone, code } = req.body;

    // בדיקה האם הקוד קיים ותואם
    if (otpStore[phone] && otpStore[phone] === code) {
        delete otpStore[phone]; // מחיקת הקוד לאחר שימוש
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "קוד שגוי או פג תוקף" });
    }
});

// === נתיב ראשי (Home Page) ===
// מגיש את קובץ ה-HTML הראשי
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// === נתיב Fallback (לכל שאר הבקשות) ===
app.get('*', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// הפעלת השרת (Local & Vercel)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}

module.exports = app;
