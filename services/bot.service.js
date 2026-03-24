const TelegramBot = require('node-telegram-bot-api');
const { BOT_TOKEN } = require('../config/config');
const {
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
    getRecentUpdates,
    saveApplication,
    approveUser,
    addUser,
    removeUser,
    getAllUsers,
    addUrl,
    removeUrl,
    getAllUrls
} = require('../controllers/admin.controller');

// ==========================================
//           BOT INITIALIZATION
// ==========================================
function initBot() {
    const bot = new TelegramBot(BOT_TOKEN, { polling: true });
    console.log("✅ Telegram Bot is running and listening for commands...");

    // একাধিক instance চললে clean error দেখানো হচ্ছে
    bot.on('polling_error', (error) => {
        if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
            console.error("❌ Bot polling conflict: Another instance is already running. Stop the other instance.");
        } else {
            console.error("❌ Bot polling error:", error.message);
        }
    });

    setupBotCommands(bot);
    setupCallbackHandlers(bot);

    return bot;
}

// ==========================================
//           BOT COMMAND HANDLERS
// ==========================================
function setupBotCommands(bot) {

    // ==========================================
    // ১. /start — সবার জন্য
    // ==========================================
    bot.onText(/^\/start$/, async (msg) => {
        const chatId = msg.chat.id;

        // চেক করা হচ্ছে ইউজার banned কিনা
        if (await isBannedUser(chatId)) {
            bot.sendMessage(chatId, "🚫 You have been banned from using this bot.");
            return;
        }

        // চেক করা হচ্ছে ইউজার আগে থেকেই অথোরাইজড কিনা (DB থেকে)
        const authorized = await isAuthorized(chatId);
        if (authorized) {
            bot.sendMessage(chatId, "You're already authorized.");
            return; // ইউজার অথোরাইজড হলে এখানেই থেমে যাবে, নিচের কোড রান করবে না
        }

        const welcomeMessage = `Welcome to Examify Notice Tracker Bot. If any University changes their notice page, it'll notify you.\n\nIf you are not authorized, please use /apply command for applying to use the bot to the owner of this bot\n\nOnce authorized, you can use /updateoff to stop receiving alerts and /updateon to resume.`;

        bot.sendMessage(chatId, welcomeMessage);
    });

    // ==========================================
    // ২. /apply — সবার জন্য
    // ==========================================
    bot.onText(/^\/apply$/, async (msg) => {
        const applicantChatId = msg.chat.id;

        // চেক করা হচ্ছে ইউজার banned কিনা
        if (await isBannedUser(applicantChatId)) {
            bot.sendMessage(applicantChatId, "🚫 You have been banned from using this bot.");
            return;
        }

        // চেক করা হচ্ছে ইউজার আগে থেকেই অথোরাইজড কিনা (DB থেকে)
        const authorized = await isAuthorized(applicantChatId);
        if (authorized) {
            bot.sendMessage(applicantChatId, "You're already authorized.");
            return; // ইউজার অথোরাইজড হলে এখানেই থেমে যাবে, আর এপ্লাই করতে পারবে না
        }

        const firstName = msg.from.first_name || '';
        const lastName = msg.from.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim() || 'Unknown Name';
        const username = msg.from.username ? `@${msg.from.username}` : 'No username';

        // DB তে এপ্লিকেশন সেভ করা হচ্ছে
        await saveApplication(applicantChatId, fullName, username);

        // ইউজারের কাছে কনফার্মেশন মেসেজ যাচ্ছে, সাথে কন্টাক্ট ইনফো অ্যাড করা হলো
        bot.sendMessage(applicantChatId, "Your application has been successfully sent to the owner. Please wait for authorization. or contact with @atifhasan250");

        // অ্যাডমিনদের inline approve button সহ নোটিফিকেশন পাঠানো হচ্ছে
        const adminMessage = `🔔 <b>New Authorization Request</b>\n\nName: ${fullName}\nUsername: ${username}\nChat ID: <code>${applicantChatId}</code>`;

        const inlineKeyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `✅ Approve ${fullName}`,
                            callback_data: `approve_${applicantChatId}`
                        }
                    ]
                ]
            },
            parse_mode: "HTML"
        };

        // সব অ্যাডমিনকে নোটিফাই করা হচ্ছে
        const { ADMIN_CHAT_ID } = require('../config/config');
        const dbAdmins = await getAllAdmins();
        const allAdminIds = [ADMIN_CHAT_ID, ...dbAdmins.map(a => String(a.chatId))];

        for (const adminId of allAdminIds) {
            bot.sendMessage(adminId, adminMessage, inlineKeyboard).catch((error) => {
                console.error("Error: Admin ke message pathano jayni. Numeric Chat ID use kora lagte pare.", error.message);
            });
        }
    });

    // ==========================================
    // ৩. /updateoff — শুধু authorized user
    // ==========================================
    bot.onText(/^\/updateoff$/, async (msg) => {
        const chatId = msg.chat.id;

        if (!await isAuthorized(chatId)) {
            bot.sendMessage(chatId, "⛔ You must be an authorized user to use this command.");
            return;
        }

        const UserModel = require('../models/user.model');
        const user = await UserModel.findOne({ chatId: Number(chatId) });

        if (user && !user.updatesEnabled) {
            bot.sendMessage(chatId, "ℹ️ Updates are already turned off for you.");
            return;
        }

        await setUpdatesEnabled(chatId, false);
        bot.sendMessage(chatId, "🔕 Updates turned off. You will no longer receive notice alerts.\n\nUse /updateon to turn them back on.");
    });

    // ==========================================
    // ৪. /updateon — শুধু authorized user
    // ==========================================
    bot.onText(/^\/updateon$/, async (msg) => {
        const chatId = msg.chat.id;

        if (!await isAuthorized(chatId)) {
            bot.sendMessage(chatId, "⛔ You must be an authorized user to use this command.");
            return;
        }

        const UserModel = require('../models/user.model');
        const user = await UserModel.findOne({ chatId: Number(chatId) });

        if (user && user.updatesEnabled) {
            bot.sendMessage(chatId, "ℹ️ Updates are already turned on for you.");
            return;
        }

        await setUpdatesEnabled(chatId, true);
        bot.sendMessage(chatId, "🔔 Updates turned on. You will now receive notice alerts again.");
    });

    // ==========================================
    // ৫. /recent — শুধু authorized user
    // ==========================================
    bot.onText(/^\/recent$/, async (msg) => {
        const chatId = msg.chat.id;

        if (!await isAuthorized(chatId)) {
            bot.sendMessage(chatId, "⛔ You must be an authorized user to use this command.");
            return;
        }

        const updates = await getRecentUpdates();

        if (updates.length === 0) {
            bot.sendMessage(chatId, "ℹ️ No website changes detected in the last 5 minutes. Bot is running normally.");
            return;
        }

        for (const update of updates) {
            bot.sendMessage(chatId, update.message, {
                parse_mode: "HTML",
                disable_web_page_preview: true
            }).catch(() => { });
        }
    });

    // ==========================================
    // ৬. /approve <chatId> — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/approve (.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const targetChatId = match[1].trim();
        const user = await approveUser(targetChatId);

        if (user) {
            bot.sendMessage(chatId, `✅ User ${targetChatId} has been approved successfully.`);
            // অ্যাপ্রুভড ইউজারকেও নোটিফাই করা হচ্ছে
            bot.sendMessage(targetChatId, "🎉 Your authorization has been approved! You will now receive notices.").catch(() => { });
        } else {
            bot.sendMessage(chatId, `❌ User ${targetChatId} not found. Make sure they have used /apply first.`);
        }
    });

    // ==========================================
    // ৪. /adduser <chatId> — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/adduser (.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const targetChatId = match[1].trim();
        const user = await addUser(targetChatId);

        if (user) {
            bot.sendMessage(chatId, `✅ User ${targetChatId} has been authorized successfully.`);
        } else {
            bot.sendMessage(chatId, `❌ Could not authorize user ${targetChatId}.`);
        }
    });

    // ==========================================
    // ৫. /removeuser <chatId> — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/removeuser (.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const targetChatId = match[1].trim();

        // নিজেকে remove করা যাবে না
        if (String(targetChatId) === String(chatId)) {
            bot.sendMessage(chatId, "⛔ You cannot remove yourself.");
            return;
        }

        // অ্যাডমিনকে remove করা যাবে না
        if (await isAdmin(targetChatId)) {
            bot.sendMessage(chatId, "⛔ You cannot remove an admin. Use /removeadmin first to revoke their admin access.");
            return;
        }

        const user = await removeUser(targetChatId);

        if (user) {
            bot.sendMessage(chatId, `✅ User ${targetChatId} has been removed successfully.`);
        } else {
            bot.sendMessage(chatId, `❌ User ${targetChatId} not found.`);
        }
    });

    // ==========================================
    // ৬. /listusers — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/listusers$/, async (msg) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const { authorized, pending } = await getAllUsers();
        const blockedUsers = await getBlockedUsers();

        // banned users সব isBanned:true যাদের
        const User = require('../models/user.model');
        const bannedUsers = await User.find({ isBanned: true });

        const formatUser = (u, i) => {
            const username = u.username !== 'No username' ? ` | ${u.username}` : '';
            return `\n${i + 1}. ${u.fullName}${username}\n    <code>${u.chatId}</code>\n`;
        };

        let message = "👥 <b>User List</b>\n\n";

        // ১. Authorized Users
        message += `✅ <b>Authorized Users (${authorized.length})</b>\n`;
        if (authorized.length === 0) {
            message += "— None\n";
        } else {
            authorized.forEach((u, i) => { message += formatUser(u, i); });
        }

        // ২. Pending Users
        message += `\n⏳ <b>Pending Users (${pending.length})</b>\n`;
        if (pending.length === 0) {
            message += "— None\n";
        } else {
            pending.forEach((u, i) => { message += formatUser(u, i); });
        }

        // ৩. Banned Users
        message += `\n🚫 <b>Banned Users (${bannedUsers.length})</b>\n`;
        if (bannedUsers.length === 0) {
            message += "— None\n";
        } else {
            bannedUsers.forEach((u, i) => { message += formatUser(u, i); });
        }

        // ৪. Blocked Bot Users
        message += `\n🔇 <b>Blocked the Bot (${blockedUsers.length})</b>\n`;
        if (blockedUsers.length === 0) {
            message += "— None\n";
        } else {
            blockedUsers.forEach((u, i) => { message += formatUser(u, i); });
        }

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    });

    // ==========================================
    // ৭. /addurl <url> — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/addurl ([\s\S]+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        // একাধিক URL নতুন লাইনে দেওয়া সাপোর্ট করা হচ্ছে
        const urls = match[1].split('\n').map(u => u.trim()).filter(u => u.length > 0);

        if (urls.length === 1) {
            const success = await addUrl(urls[0]);
            if (success) {
                bot.sendMessage(chatId, `✅ URL added successfully:\n${urls[0]}`);
            } else {
                bot.sendMessage(chatId, `❌ Failed to add URL. It may already exist.`);
            }
        } else {
            let results = '';
            for (const url of urls) {
                const success = await addUrl(url);
                results += success ? `✅ ${url}\n` : `❌ ${url} (already exists or failed)\n`;
            }
            bot.sendMessage(chatId, `<b>Bulk URL Add Results:</b>\n\n${results}`, { parse_mode: "HTML" });
        }
    });

    // ==========================================
    // ৮. /removeurl <url> — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/removeurl (.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const url = match[1].trim();
        const success = await removeUrl(url);

        if (success) {
            bot.sendMessage(chatId, `✅ URL removed successfully:\n${url}`);
        } else {
            bot.sendMessage(chatId, `❌ URL not found:\n${url}`);
        }
    });

    // ==========================================
    // ৯. /listurls — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/listurls$/, async (msg) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const urls = await getAllUrls();

        if (urls.length === 0) {
            bot.sendMessage(chatId, "⚠️ No URLs are being tracked. Use /addurl to add one.");
            return;
        }

        let message = `🔗 <b>Tracked URLs (${urls.length})</b>\n\n`;
        urls.forEach((u, i) => {
            message += `\n${i + 1}. ${u.url}\n`;
        });

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    });

    // ==========================================
    // ১০. /ban <chatId> — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/ban (.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const targetChatId = match[1].trim();

        // নিজেকে ban করা যাবে না
        if (String(targetChatId) === String(chatId)) {
            bot.sendMessage(chatId, "⛔ You cannot ban yourself.");
            return;
        }

        // অন্য অ্যাডমিনকে ban করা যাবে না
        if (await isAdmin(targetChatId)) {
            bot.sendMessage(chatId, "⛔ You cannot ban an admin.");
            return;
        }

        const user = await banUser(targetChatId);

        if (user) {
            bot.sendMessage(chatId, `🚫 User ${targetChatId} has been banned successfully.`);
            bot.sendMessage(targetChatId, "🚫 You have been banned from using this bot.").catch(() => { });
        } else {
            bot.sendMessage(chatId, `❌ Failed to ban user ${targetChatId}.`);
        }
    });

    // ==========================================
    // ১১. /unban <chatId> — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/unban (.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const targetChatId = match[1].trim();

        // শুধু banned user কেই unban করা যাবে
        const banned = await isBannedUser(targetChatId);
        if (!banned) {
            bot.sendMessage(chatId, `❌ User ${targetChatId} is not banned.`);
            return;
        }

        const user = await unbanUser(targetChatId);

        if (user) {
            bot.sendMessage(chatId, `✅ User ${targetChatId} has been unbanned successfully.`);
            bot.sendMessage(targetChatId, "✅ You have been unbanned. You can now use /apply to request access again.").catch(() => { });
        } else {
            bot.sendMessage(chatId, `❌ Failed to unban user ${targetChatId}.`);
        }
    });

    // ==========================================
    // ১২. /addnewadmin <chatId> — শুধু primary admin
    // ==========================================
    bot.onText(/^\/addnewadmin (.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!isPrimaryAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only the primary admin can use this command.");
            return;
        }

        const targetChatId = match[1].trim();

        // DB তে ইউজার আছে কিনা চেক করো, থাকলে তার নাম/ইউজারনেম নাও
        const existingUser = await require('../models/user.model').findOne({ chatId: Number(targetChatId) });
        const fullName = existingUser?.fullName || 'Unknown Name';
        const username = existingUser?.username || 'No username';

        const success = await addAdmin(targetChatId, fullName, username);

        if (success) {
            bot.sendMessage(chatId, `✅ Admin added successfully.\n\nChat ID: <code>${targetChatId}</code>\nName: ${fullName}\nUsername: ${username}`, { parse_mode: "HTML" });
            // নতুন অ্যাডমিনকে নোটিফাই করা হচ্ছে
            bot.sendMessage(targetChatId, "🎉 You have been granted admin access to Examify Notice Tracker Bot!").catch(() => { });
        } else {
            bot.sendMessage(chatId, `❌ Failed to add admin ${targetChatId}.`);
        }
    });

    // ==========================================
    // ১১. /removeadmin <chatId> — শুধু primary admin
    // ==========================================
    bot.onText(/^\/removeadmin (.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!isPrimaryAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only the primary admin can use this command.");
            return;
        }

        const targetChatId = match[1].trim();

        // primary admin নিজেকে remove করতে পারবে না
        if (isPrimaryAdmin(targetChatId)) {
            bot.sendMessage(chatId, "⛔ You cannot remove the primary admin.");
            return;
        }

        const success = await removeAdmin(targetChatId);

        if (success) {
            bot.sendMessage(chatId, `✅ Admin ${targetChatId} has been removed successfully. They are still an authorized user.`);
            bot.sendMessage(targetChatId, "ℹ️ Your admin access to Examify Notice Tracker Bot has been revoked. You are still an authorized user.").catch(() => { });
        } else {
            bot.sendMessage(chatId, `❌ Admin ${targetChatId} not found.`);
        }
    });

    // ==========================================
    // ১২. /listadmins — শুধু primary admin
    // ==========================================
    bot.onText(/^\/listadmins$/, async (msg) => {
        const chatId = msg.chat.id;

        if (!isPrimaryAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only the primary admin can use this command.");
            return;
        }

        const { ADMIN_CHAT_ID } = require('../config/config');
        const dbAdmins = await getAllAdmins();

        let message = `👑 <b>Admin List</b>\n\n`;
        message += `🔑 <b>Primary Admin</b>\n`;
        message += `1. <code>${ADMIN_CHAT_ID}</code> (You)\n\n`;

        message += `🛡️ <b>Secondary Admins (${dbAdmins.length})</b>\n`;
        if (dbAdmins.length === 0) {
            message += "— None\n";
        } else {
            dbAdmins.forEach((a, i) => {
                const username = a.username !== 'No username' ? ` | ${a.username}` : '';
                message += `\n${i + 1}. ${a.fullName}${username}\n    <code>${a.chatId}</code>\n`;
            });
        }

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    });

    // ==========================================
    // ১৩. /msgadmins <msg> — শুধু primary admin
    // ==========================================
    bot.onText(/^\/msgadmins (.+)$/s, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!isPrimaryAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only the primary admin can use this command.");
            return;
        }

        const userMessage = match[1].trim();
        const formattedMessage = `📢 This is a message from Admin:\n\n${userMessage}`;

        const dbAdmins = await getAllAdmins();

        if (dbAdmins.length === 0) {
            bot.sendMessage(chatId, "⚠️ No secondary admins found to message.");
            return;
        }

        let successCount = 0;
        for (const admin of dbAdmins) {
            try {
                await bot.sendMessage(String(admin.chatId), formattedMessage);
                successCount++;
            } catch (err) {
                console.error(`Failed to message admin ${admin.chatId}:`, err.message);
            }
        }

        bot.sendMessage(chatId, `✅ Message sent to ${successCount}/${dbAdmins.length} secondary admins.`);
    });

    // ==========================================
    // ১৪. /msgall <msg> — শুধু primary admin
    // ==========================================
    bot.onText(/^\/msgall (.+)$/s, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!isPrimaryAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only the primary admin can use this command.");
            return;
        }

        const userMessage = match[1].trim();
        const formattedMessage = `📢 This is a message from Admin:\n\n${userMessage}`;

        const { ADMIN_CHAT_ID } = require('../config/config');
        const dbAdmins = await getAllAdmins();
        const authorizedChatIds = await require('../controllers/admin.controller').getAuthorizedChatIds();

        // সব secondary admin এবং authorized user দের একসাথে মেসেজ পাঠানো হচ্ছে (duplicate ছাড়া)
        const allChatIds = [...new Set([...dbAdmins.map(a => String(a.chatId)), ...authorizedChatIds])];

        if (allChatIds.length === 0) {
            bot.sendMessage(chatId, "⚠️ No users or admins found to message.");
            return;
        }

        let successCount = 0;
        for (const id of allChatIds) {
            try {
                await bot.sendMessage(id, formattedMessage);
                successCount++;
            } catch (err) {
                console.error(`Failed to message ${id}:`, err.message);
            }
        }

        bot.sendMessage(chatId, `✅ Message sent to ${successCount}/${allChatIds.length} users and admins.`);
    });

    // ==========================================
    // ১৫. /adminhelp — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/adminhelp$/, async (msg) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const { ADMIN_CHAT_ID } = require('../config/config');
        const isPrimary = isPrimaryAdmin(chatId);

        let message = `🛠️ <b>Admin Command List</b>\n\n`;

        message += `👥 <b>User Management</b>\n`;
        message += `/listusers — List all authorized and pending users\n`;
        message += `/approve &lt;chatId&gt; — Approve a pending user\n`;
        message += `/adduser &lt;chatId&gt; — Authorize a user directly\n`;
        message += `/removeuser &lt;chatId&gt; — Remove a user completely\n`;
        message += `/ban &lt;chatId&gt; — Ban a user from the bot\n`;
        message += `/unban &lt;chatId&gt; — Unban a banned user\n\n`;

        message += `🔗 <b>URL Management</b>\n`;
        message += `/listurls — List all tracked URLs\n`;
        message += `/addurl &lt;url&gt; — Add a URL to track\n`;
        message += `/addurl &lt;url1&gt;\n&lt;url2&gt;\n&lt;url3&gt; — Add multiple URLs at once (one per line)\n`;
        message += `/removeurl &lt;url&gt; — Remove a tracked URL\n`;

        // primary admin এর জন্য extra commands দেখানো হচ্ছে
        if (isPrimary) {
            message += `\n👑 <b>Primary Admin Only</b>\n`;
            message += `/listadmins — List all admins\n`;
            message += `/addnewadmin &lt;chatId&gt; — Add a new secondary admin\n`;
            message += `/removeadmin &lt;chatId&gt; — Remove a secondary admin\n`;
            message += `/msgadmins &lt;msg&gt; — Send a message to all secondary admins\n`;
            message += `/msgall &lt;msg&gt; — Send a message to all users and admins\n`;
        }

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    });
}

// ==========================================
//     INLINE BUTTON CALLBACK HANDLERS
// ==========================================
function setupCallbackHandlers(bot) {

    bot.on('callback_query', async (callbackQuery) => {
        const adminChatId = callbackQuery.from.id;
        const data = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;
        const chatId = callbackQuery.message.chat.id;

        // শুধু অ্যাডমিনরাই বাটন ক্লিক করতে পারবে
        if (!await isAdmin(adminChatId)) {
            bot.answerCallbackQuery(callbackQuery.id, { text: "⛔ You are not an admin." });
            return;
        }

        // approve_{chatId} callback handle করা হচ্ছে
        if (data.startsWith('approve_')) {
            const targetChatId = data.replace('approve_', '');

            // আগেই approve হয়ে গেছে কিনা চেক করা হচ্ছে
            const alreadyApproved = await isAuthorized(targetChatId);
            if (alreadyApproved) {
                bot.answerCallbackQuery(callbackQuery.id, { text: "✅ Already approved by another admin." });
                // বাটন সরিয়ে দেওয়া হচ্ছে
                bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: messageId
                }).catch(() => { });
                return;
            }

            const user = await approveUser(targetChatId);

            if (user) {
                // বাটনটা সরিয়ে success মেসেজ দেখানো হচ্ছে
                bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: messageId
                });

                bot.answerCallbackQuery(callbackQuery.id, { text: `✅ ${user.fullName} approved!` });

                bot.editMessageText(
                    `✅ <b>Approved!</b>\n\nName: ${user.fullName}\nUsername: ${user.username}\nChat ID: <code>${user.chatId}</code>`,
                    { chat_id: chatId, message_id: messageId, parse_mode: "HTML" }
                );

                // অ্যাপ্রুভড ইউজারকে নোটিফাই করা হচ্ছে
                bot.sendMessage(targetChatId, "🎉 Your authorization has been approved! You will now receive notices.").catch(() => { });
            } else {
                bot.answerCallbackQuery(callbackQuery.id, { text: "❌ User not found." });
            }
        }
    });
}

module.exports = { initBot };