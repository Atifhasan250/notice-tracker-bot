const axios = require('axios');
const { BOT_TOKEN, ADMIN_CHAT_ID } = require('../config/config');
const { getAuthorizedChatIds, getAllAdmins } = require('../controllers/admin.controller');

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
        try {
            await axios.post(apiUrl, {
                chat_id: chatId,
                text: message,
                parse_mode: "HTML",
                disable_web_page_preview: true
            });
        } catch (error) {
            console.error(`Failed to send Telegram message to ${chatId}:`, error.message);
        }
    }
}

module.exports = { sendTelegramAlert };