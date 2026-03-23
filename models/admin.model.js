const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
    chatId: { type: Number, unique: true },
    fullName: { type: String, default: 'Unknown Name' },
    username: { type: String, default: 'No username' },
    addedAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', AdminSchema);

module.exports = Admin;
