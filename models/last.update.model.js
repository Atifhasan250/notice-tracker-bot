const mongoose = require('mongoose');

// সর্বশেষ আপডেট সংরক্ষণের জন্য আলাদা collection
const LastUpdateSchema = new mongoose.Schema({
    url: { type: String, unique: true },
    message: { type: String },
    updatedAt: { type: Date, default: Date.now }
});

const LastUpdate = mongoose.model('LastUpdate', LastUpdateSchema);

module.exports = LastUpdate;
