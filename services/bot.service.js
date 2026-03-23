const TelegramBot = require('node-telegram-bot-api');
const { BOT_TOKEN } = require('../config/config');
const {
    isPrimaryAdmin,
    isAdmin,
    addAdmin,
    removeAdmin,
    getAllAdmins,
    isAuthorized,
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

        // চেক করা হচ্ছে ইউজার আগে থেকেই অথোরাইজড কিনা (DB থেকে)
        const authorized = await isAuthorized(chatId);
        if (authorized) {
            bot.sendMessage(chatId, "You're already authorized.");
            return; // ইউজার অথোরাইজড হলে এখানেই থেমে যাবে, নিচের কোড রান করবে না
        }

        const welcomeMessage = `Welcome to Examify Notice Tracker Bot. If any University changes their notice page, it'll notify you.\n\nIf you are not authorized, please use /apply command for applying to use the bot to the owner of this bot`;

        bot.sendMessage(chatId, welcomeMessage);
    });

    // ==========================================
    // ২. /apply — সবার জন্য
    // ==========================================
    bot.onText(/^\/apply$/, async (msg) => {
        const applicantChatId = msg.chat.id;

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
    // ৩. /approve <chatId> — যেকোনো অ্যাডমিন
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

        let message = "👥 <b>User List</b>\n\n";

        message += `✅ <b>Authorized Users (${authorized.length})</b>\n`;
        if (authorized.length === 0) {
            message += "— None\n";
        } else {
            authorized.forEach((u, i) => {
                const username = u.username !== 'No username' ? ` | ${u.username}` : '';
                message += `\n${i + 1}. ${u.fullName}${username}\n    <code>${u.chatId}</code>\n`;
            });
        }

        message += `\n⏳ <b>Pending Users (${pending.length})</b>\n`;
        if (pending.length === 0) {
            message += "— None\n";
        } else {
            pending.forEach((u, i) => {
                const username = u.username !== 'No username' ? ` | ${u.username}` : '';
                message += `\n${i + 1}. ${u.fullName}${username}\n    <code>${u.chatId}</code>\n`;
            });
        }

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    });

    // ==========================================
    // ৭. /addurl <url> — যেকোনো অ্যাডমিন
    // ==========================================
    bot.onText(/^\/addurl (.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;

        if (!await isAdmin(chatId)) {
            bot.sendMessage(chatId, "⛔ Only admins can use this command.");
            return;
        }

        const url = match[1].trim();
        const success = await addUrl(url);

        if (success) {
            bot.sendMessage(chatId, `✅ URL added successfully:\n${url}`);
        } else {
            bot.sendMessage(chatId, `❌ Failed to add URL. It may already exist.`);
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
    // ১০. /addnewadmin <chatId> — শুধু primary admin
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
    // ১৩. /adminhelp — যেকোনো অ্যাডমিন
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
        message += `/removeuser &lt;chatId&gt; — Revoke a user's access\n\n`;

        message += `🔗 <b>URL Management</b>\n`;
        message += `/listurls — List all tracked URLs\n`;
        message += `/addurl &lt;url&gt; — Add a new URL to track\n`;
        message += `/removeurl &lt;url&gt; — Remove a tracked URL\n`;

        // primary admin এর জন্য extra commands দেখানো হচ্ছে
        if (isPrimary) {
            message += `\n👑 <b>Primary Admin Only</b>\n`;
            message += `/listadmins — List all admins\n`;
            message += `/addnewadmin &lt;chatId&gt; — Add a new secondary admin\n`;
            message += `/removeadmin &lt;chatId&gt; — Remove a secondary admin\n`;
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