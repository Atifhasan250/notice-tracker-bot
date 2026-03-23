const mongoose = require('mongoose');

// ==========================================
//             MONGODB CONNECTION
// ==========================================
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB Atlas");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        process.exit(1);
    }
}

module.exports = connectDB;
