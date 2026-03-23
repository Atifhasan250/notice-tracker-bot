require('dotenv').config();
const app = require('./app');
const connectDB = require('./db/db');
const { loadInitialStates, checkWebsites } = require('./controllers/tracker.controller');
const { initBot } = require('./services/bot.service');

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

    await checkWebsites();

    setInterval(checkWebsites, 5 * 60 * 1000);
}

startTracker();
