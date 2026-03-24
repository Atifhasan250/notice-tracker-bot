const axios = require('axios');
const { BOT_TOKEN, ADMIN_CHAT_ID } = require('../config/config');
const { getAuthorizedChatIds, getAllAdmins, setBlockedBot } = require('../controllers/admin.controller');

// ==========================================
//      NOTIFY PRIMARY ADMIN
// ==========================================
async function notifyPrimaryAdmin(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_CHAT_ID,
            text: message,
            parse_mode: "HTML"
        });
    } catch (err) {
        console.error("❌ Could not notify primary admin:", err.message);
    }
}

// ==========================================
//      SINGLE MESSAGE SEND WITH RETRY
// ==========================================
async function sendWithRetry(apiUrl, payload, chatId) {
    try {
        await axios.post(apiUrl, payload);

        // মেসেজ সফলভাবে গেছে মানে আগে blocked ছিলে এখন unblock হয়েছে কিনা চেক করা হচ্ছে
        const { User } = require('../models/user.model') || {};
        const UserModel = require('../models/user.model');
        const user = await UserModel.findOne({ chatId: Number(chatId), isBlockedBot: true });
        if (user) {
            // আগে blocked ছিল কিন্তু এখন মেসেজ গেছে — unblocked হয়েছে
            await setBlockedBot(chatId, false);
            const username = user.username !== 'No username' ? ` | ${user.username}` : '';
            await notifyPrimaryAdmin(
                `🔓 <b>User Unblocked the Bot</b>\n\nName: ${user.fullName}${username}\nChat ID: <code>${chatId}</code>\n\nThey can now receive alerts again.`
            );
        }

    } catch (error) {
        const is403 = error?.response?.data?.error_code === 403 ||
            (error?.message && error.message.includes('403'));

        if (is403) {
            // আগে blocked ছিল কিনা চেক করা হচ্ছে
            try {
                const UserModel = require('../models/user.model');
                const user = await UserModel.findOne({ chatId: Number(chatId) });

                // শুধুমাত্র প্রথমবার block হলেই notify করা হবে
                if (user && !user.isBlockedBot) {
                    await setBlockedBot(chatId, true);
                    const name = user?.fullName || 'Unknown Name';
                    const username = user?.username && user.username !== 'No username' ? ` | ${user.username}` : '';
                    await notifyPrimaryAdmin(
                        `🚫 <b>User Blocked the Bot</b>\n\nName: ${name}${username}\nChat ID: <code>${chatId}</code>`
                    );
                }
            } catch (e) {
                console.error("❌ Could not fetch user info for block notification:", e.message);
            }

            console.error(`Failed to send Telegram message to ${chatId}: bot was blocked by the user`);
        } else {
            // অন্য error হলে retry করা হচ্ছে
            console.error(`Failed to send Telegram message to ${chatId}: ${error.message}. Retrying in 5s...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            try {
                await axios.post(apiUrl, payload);
            } catch (retryError) {
                console.error(`Retry also failed for ${chatId}:`, retryError.message);
            }
        }
    }
}

async function sendTelegramAlert(message) {
    const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const User = require('../models/user.model'); // Import User model

    // 1. Get everyone who might receive the message
    const dbAdmins = await getAllAdmins();
    const adminChatIds = dbAdmins.map(a => String(a.chatId));

    // Combine Primary Admin, Secondary Admins, and everyone else
    // We start with a full list of potential people
    const potentialRecipients = [...new Set([ADMIN_CHAT_ID, ...adminChatIds])];

    // Add all authorized users to the potential list
    const { authorized } = await require('../controllers/admin.controller').getAllUsers();
    authorized.forEach(u => potentialRecipients.push(String(u.chatId)));

    // 2. Filter that list: ONLY keep people who have updatesEnabled !== false
    const finalRecipientList = [];

    for (const chatId of [...new Set(potentialRecipients)]) {
        const userStatus = await User.findOne({ chatId: Number(chatId) });

        // If the user doesn't exist in DB (like maybe the Primary Admin), 
        // OR if they exist and have updatesEnabled set to true, add them.
        if (!userStatus || userStatus.updatesEnabled !== false) {
            finalRecipientList.push(chatId);
        }
    }

    // 3. Send the messages
    for (const chatId of finalRecipientList) {
        const payload = {
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
            disable_web_page_preview: true
        };
        await sendWithRetry(apiUrl, payload, chatId);
    }
}

module.exports = { sendTelegramAlert };