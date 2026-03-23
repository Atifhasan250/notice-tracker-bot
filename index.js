require('dotenv').config();
const axios = require('axios');
const app = require('./app');
const connectDB = require('./db/db');
const { loadInitialStates, checkWebsites } = require('./controllers/tracker.controller');
const { initBot } = require('./services/bot.service');

// ==========================================
//         NOTIFY ADMIN VIA TELEGRAM
// ==========================================
async function notifyAdmin(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            chat_id: process.env.ADMIN_CHAT_ID,
            text: message,
            parse_mode: "HTML"
        });
    } catch (err) {
        console.error("❌ Could not notify admin:", err.message);
    }
}

// ==========================================
//     CATCH UNHANDLED CRASHES
// ==========================================

// কোনো unhandled promise rejection হলে admin কে notify করা হবে
process.on('unhandledRejection', async (reason) => {
    const message = reason?.message || String(reason);
    console.error("❌ Unhandled Rejection:", message);
    await notifyAdmin(`🔴 <b>Bot Error!</b>\n\nUnhandled error occurred:\n<code>${message}</code>`);
});

// কোনো uncaught exception হলে admin কে notify করা হবে
process.on('uncaughtException', async (err) => {
    console.error("❌ Uncaught Exception:", err.message);
    await notifyAdmin(`🔴 <b>Bot Crashed!</b>\n\nUncaught exception:\n<code>${err.message}</code>`);
});

// ==========================================
//               MAIN LOOP
// ==========================================

async function startTracker() {
    console.log("🚀 Examify Notice Tracker is starting...");

    await connectDB();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 web server running on port ${PORT}`);
    });

    initBot();

    await loadInitialStates();

    console.log("✅ Examify Notice Tracker is now online! Ready to track changes.");

    // Bot চালু হলে admin কে notify করা হচ্ছে (Render restart detect করার জন্য)
    await notifyAdmin("🟢 <b>Bot Started!</b>\n\nExamify Notice Tracker is online and tracking.");

    await checkWebsites();

    setInterval(checkWebsites, 5 * 60 * 1000);
}

startTracker();