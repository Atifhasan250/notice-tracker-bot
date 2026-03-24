const User = require('../models/user.model');
const Admin = require('../models/admin.model');
const { Site, TrackedUrl } = require('../models/tracker.model');
const LastUpdate = require('../models/last.update.model');
const { ADMIN_CHAT_ID } = require('../config/config');

// ==========================================
//         PRIMARY ADMIN CHECK (from .env)
// ==========================================
function isPrimaryAdmin(chatId) {
    return String(chatId) === String(ADMIN_CHAT_ID);
}

// ==========================================
//    ANY ADMIN CHECK (primary + DB admins)
// ==========================================
async function isAdmin(chatId) {
    if (isPrimaryAdmin(chatId)) return true;
    try {
        const admin = await Admin.findOne({ chatId: Number(chatId) });
        return !!admin;
    } catch (err) {
        console.error("❌ Error checking admin status:", err.message);
        return false;
    }
}

// ==========================================
//         ADD A NEW SECONDARY ADMIN
// ==========================================
async function addAdmin(chatId, fullName, username) {
    try {
        // admins collection এ add করা হচ্ছে
        await Admin.findOneAndUpdate(
            { chatId: Number(chatId) },
            { chatId: Number(chatId), fullName, username },
            { upsert: true, returnDocument: 'after' }
        );

        // users collection এ authorized user হিসেবেও add করা হচ্ছে, banned হলে unban হবে
        await User.findOneAndUpdate(
            { chatId: Number(chatId) },
            { chatId: Number(chatId), fullName, username, isAuthorized: true, isBanned: false },
            { upsert: true, returnDocument: 'after' }
        );

        console.log(`💾 New admin added to DB: ${chatId}`);
        return true;
    } catch (err) {
        console.error("❌ Error adding admin:", err.message);
        return false;
    }
}

// ==========================================
//         REMOVE A SECONDARY ADMIN
//         (keeps them as authorized user)
// ==========================================
async function removeAdmin(chatId) {
    try {
        // শুধু admins collection থেকে সরানো হচ্ছে
        // users collection এ authorized user হিসেবে থেকে যাবে
        const result = await Admin.findOneAndDelete({ chatId: Number(chatId) });
        return !!result;
    } catch (err) {
        console.error("❌ Error removing admin:", err.message);
        return false;
    }
}

// ==========================================
//         GET ALL SECONDARY ADMINS
// ==========================================
async function getAllAdmins() {
    try {
        const admins = await Admin.find({});
        return admins;
    } catch (err) {
        console.error("❌ Error fetching admins:", err.message);
        return [];
    }
}

// ==========================================
//     SET USER BOT BLOCKED/UNBLOCKED STATUS
// ==========================================
async function setBlockedBot(chatId, isBlocked) {
    try {
        await User.findOneAndUpdate(
            { chatId: Number(chatId) },
            { isBlockedBot: isBlocked },
            { upsert: false }
        );
    } catch (err) {
        console.error("❌ Error updating blocked status:", err.message);
    }
}

// ==========================================
//         GET ALL BLOCKED BOT USERS
// ==========================================
async function getBlockedUsers() {
    try {
        const users = await User.find({ isBlockedBot: true });
        return users;
    } catch (err) {
        console.error("❌ Error fetching blocked users:", err.message);
        return [];
    }
}


async function banUser(chatId) {
    try {
        const user = await User.findOneAndUpdate(
            { chatId: Number(chatId) },
            { chatId: Number(chatId), isBanned: true, isAuthorized: false },
            { upsert: true, returnDocument: 'after' }
        );
        return user;
    } catch (err) {
        console.error("❌ Error banning user:", err.message);
        return null;
    }
}

// ==========================================
//         UNBAN A USER
// ==========================================
async function unbanUser(chatId) {
    try {
        // শুধু banned user কেই unban করা যাবে
        const user = await User.findOneAndUpdate(
            { chatId: Number(chatId), isBanned: true },
            { isBanned: false },
            { returnDocument: 'after' }
        );
        return user;
    } catch (err) {
        console.error("❌ Error unbanning user:", err.message);
        return null;
    }
}

// ==========================================
//         CHECK IF USER IS BANNED
// ==========================================
async function isBannedUser(chatId) {
    try {
        const user = await User.findOne({ chatId: Number(chatId), isBanned: true });
        return !!user;
    } catch (err) {
        console.error("❌ Error checking ban status:", err.message);
        return false;
    }
}


async function isAuthorized(chatId) {
    try {
        const user = await User.findOne({ chatId: Number(chatId), isAuthorized: true });
        return !!user;
    } catch (err) {
        console.error("❌ Error checking authorization:", err.message);
        return false;
    }
}

// ==========================================
//         SAVE APPLICATION TO DB
// ==========================================
async function saveApplication(chatId, fullName, username) {
    try {
        await User.findOneAndUpdate(
            { chatId: Number(chatId) },
            { chatId: Number(chatId), fullName, username, isAuthorized: false },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`💾 Application saved to DB for chatId: ${chatId}`);
    } catch (err) {
        console.error("❌ Error saving application:", err.message);
    }
}

// ==========================================
//         APPROVE USER (flip isAuthorized)
// ==========================================
async function approveUser(chatId) {
    try {
        const user = await User.findOneAndUpdate(
            { chatId: Number(chatId) },
            { isAuthorized: true },
            { returnDocument: 'after' }
        );
        return user;
    } catch (err) {
        console.error("❌ Error approving user:", err.message);
        return null;
    }
}

// ==========================================
//   ADD USER DIRECTLY (with or without apply)
//   banned হলে automatically unban হবে
// ==========================================
async function addUser(chatId) {
    try {
        const user = await User.findOneAndUpdate(
            { chatId: Number(chatId) },
            { chatId: Number(chatId), isAuthorized: true, isBanned: false },
            { upsert: true, returnDocument: 'after' }
        );
        return user;
    } catch (err) {
        console.error("❌ Error adding user:", err.message);
        return null;
    }
}

// ==========================================
//         REMOVE USER AUTHORIZATION
// ==========================================
async function removeUser(chatId) {
    try {
        const user = await User.findOneAndDelete({ chatId: Number(chatId) });
        return user;
    } catch (err) {
        console.error("❌ Error removing user:", err.message);
        return null;
    }
}

// ==========================================
//     GET ALL USERS (authorized + pending)
// ==========================================
async function getAllUsers() {
    try {
        // authorized: isAuthorized true, banned না, blocked না
        const authorized = await User.find({
            isAuthorized: true,
            isBanned: false,
            isBlockedBot: false
        });
        // pending: isAuthorized false এবং banned না
        const pending = await User.find({
            isAuthorized: false,
            isBanned: false
        });
        return { authorized, pending };
    } catch (err) {
        console.error("❌ Error fetching users:", err.message);
        return { authorized: [], pending: [] };
    }
}

// ==========================================
//         ADD A TRACKING URL
// ==========================================
async function addUrl(url) {
    try {
        await TrackedUrl.findOneAndUpdate(
            { url: url },
            { url: url },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`💾 URL added to DB: ${url}`);
        return true;
    } catch (err) {
        console.error("❌ Error adding URL:", err.message);
        return false;
    }
}

// ==========================================
//         REMOVE A TRACKING URL
// ==========================================
async function removeUrl(url) {
    try {
        const result = await TrackedUrl.findOneAndDelete({ url: url });
        if (result) {
            // TrackedUrl থেকে মুছে দেওয়ার পর Site collection থেকেও মুছে দেওয়া হচ্ছে
            await Site.findOneAndDelete({ url: url });
            console.log(`🗑️ Removed URL and site data from DB: ${url}`);
        }
        return !!result;
    } catch (err) {
        console.error("❌ Error removing URL:", err.message);
        return false;
    }
}

// ==========================================
//         GET ALL TRACKING URLS
// ==========================================
async function getAllUrls() {
    try {
        const urls = await TrackedUrl.find({});
        return urls;
    } catch (err) {
        console.error("❌ Error fetching URLs:", err.message);
        return [];
    }
}

// ==========================================
//     SAVE LAST UPDATE MESSAGE PER URL
// ==========================================
async function saveLastUpdate(url, message) {
    try {
        await LastUpdate.findOneAndUpdate(
            { url: url },
            { url, message, updatedAt: new Date() },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        console.error("❌ Error saving last update:", err.message);
    }
}

// ==========================================
//     GET RECENT UPDATES (last 5 min)
// ==========================================
async function getRecentUpdates() {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const updates = await LastUpdate.find({ updatedAt: { $gte: fiveMinutesAgo } });
        return updates;
    } catch (err) {
        console.error("❌ Error fetching recent updates:", err.message);
        return [];
    }
}


//    banned, blocked, updatesOff বাদ দেওয়া হচ্ছে
// ==========================================
async function getAuthorizedChatIds() {
    try {
        const users = await User.find({
            isAuthorized: true,
            isBanned: false,
            isBlockedBot: false,
            updatesEnabled: true
        });
        return users.map(u => String(u.chatId));
    } catch (err) {
        console.error("❌ Error fetching authorized chat IDs:", err.message);
        return [];
    }
}

// ==========================================
//     SET UPDATES ENABLED/DISABLED
// ==========================================
async function setUpdatesEnabled(chatId, enabled) {
    try {
        await User.findOneAndUpdate(
            { chatId: Number(chatId) },
            { updatesEnabled: enabled }
        );
    } catch (err) {
        console.error("❌ Error updating updates preference:", err.message);
    }
}

module.exports = {
    isPrimaryAdmin,
    isAdmin,
    addAdmin,
    removeAdmin,
    getAllAdmins,
    isAuthorized,
    isBannedUser,
    banUser,
    unbanUser,
    setBlockedBot,
    getBlockedUsers,
    setUpdatesEnabled,
    saveLastUpdate,
    getRecentUpdates,
    saveApplication,
    approveUser,
    addUser,
    removeUser,
    getAllUsers,
    addUrl,
    removeUrl,
    getAllUrls,
    getAuthorizedChatIds
};