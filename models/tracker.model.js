const mongoose = require('mongoose');

const SiteSchema = new mongoose.Schema({
    url: { type: String, unique: true },
    lastText: String
});

const TrackedUrlSchema = new mongoose.Schema({
    url: { type: String, unique: true },
    addedAt: { type: Date, default: Date.now }
});

const Site = mongoose.model('Site', SiteSchema);
const TrackedUrl = mongoose.model('TrackedUrl', TrackedUrlSchema);

module.exports = { Site, TrackedUrl };
