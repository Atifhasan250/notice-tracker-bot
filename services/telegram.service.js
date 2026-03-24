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

    // অথোরাইজড ইউজারদের চ্যাট আইডি DB থেকে নিয়ে আসা হচ্ছে
    const userChatIds = await getAuthorizedChatIds();

    // সব secondary admin এর চ্যাট আইডি নিয়ে আসা হচ্ছে
    const dbAdmins = await getAllAdmins();
    const adminChatIds = dbAdmins.map(a => String(a.chatId));

    // primary admin, secondary admins এবং authorized users সবাইকে মেসেজ পাঠানো হচ্ছে
    const allChatIds = [...new Set([ADMIN_CHAT_ID, ...adminChatIds, ...userChatIds])];

    for (const chatId of allChatIds) {
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