const mongoose = require('mongoose');
const axios = require('axios');

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
//             MONGODB CONNECTION
// ==========================================
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB Atlas");
        await notifyAdmin("🔴 <b>Alert!</b>\n\nMongoDB connection lost. Bot may not function correctly.");

        // MongoDB disconnect হলে admin কে notify করা হবে
        mongoose.connection.on('disconnected', async () => {
            console.error("❌ MongoDB disconnected!");
            await notifyAdmin("🟢 MongoDB reconnected successfully.");
        });

        // MongoDB reconnect হলে admin কে notify করা হবে
        mongoose.connection.on('reconnected', async () => {
            console.log("✅ MongoDB reconnected!");
            await notifyAdmin("🟢 <b>Recovered!</b>\n\nMongoDB reconnected successfully.");
        });

        // MongoDB error হলে admin কে notify করা হবে
        mongoose.connection.on('error', async (err) => {
            console.error("❌ MongoDB error:", err.message);
            await notifyAdmin(`🔴 <b>MongoDB Error!</b>\n\n<code>${err.message}</code>`);
        });

    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        process.exit(1);
    }
}

module.exports = connectDB;