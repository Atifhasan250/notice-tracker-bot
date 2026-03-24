const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    chatId: { type: Number, unique: true },
    fullName: { type: String, default: 'Unknown Name' },
    username: { type: String, default: 'No username' },
    isAuthorized: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    isBlockedBot: { type: Boolean, default: false },
    updatesEnabled: { type: Boolean, default: true },
    appliedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

module.exports = User;