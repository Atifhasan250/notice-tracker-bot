require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const axios = require('axios');
const Diff = require('diff');
const express = require('express');
const app = express();


// This gives Render a webpage to look at so it doesn't shut your bot down
app.get('/', (req, res) => {
    res.send('Notice Bot is perfectly alive and tracking!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 web server running on port ${PORT}`);
});


// Add the stealth plugin so Cloudflare doesn't block us
puppeteer.use(StealthPlugin());

// ==========================================
//              CONFIGURATION
// ==========================================
// ==========================================
//              CONFIGURATION
// ==========================================
const BOT_TOKEN = process.env.BOT_TOKEN;

// Put your ID, and any friends' IDs here inside quotes, separated by commas!
const CHAT_IDS = [
    "6112202394",
    "7122512716"
];

const URLS_TO_TRACK = [
    "https://admission.sust.edu.bd",
    "https://apply.ku.ac.bd/prospectus",
    "https://admission.iutoic-dhaka.edu/notice"
];

// Memory to store the last known text of each website
let websiteStates = {};
URLS_TO_TRACK.forEach(url => websiteStates[url] = "");

// ==========================================
//            CORE FUNCTIONS
// ==========================================

// ==========================================
//            CORE FUNCTIONS
// ==========================================

async function sendTelegramAlert(message) {
    const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    // Loop through every ID in the list and send the message
    for (const chatId of CHAT_IDS) {
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

function extractVisibleText(htmlContent) {
    const $ = cheerio.load(htmlContent);

    // Remove invisible elements and code blocks
    $('script, style, noscript, meta, header, footer').remove();

    // Extract text, split by lines, trim spaces, and remove empty lines
    const text = $('body').text();
    const cleanLines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    return cleanLines.join('\n');
}

async function checkWebsites() {
    console.log("\n--- Starting checking cycle ---");

    // Launch an actual invisible browser
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    // Set a realistic viewport
    await page.setViewport({ width: 1280, height: 720 });

    for (const url of URLS_TO_TRACK) {
        try {
            // waitUntil: 'networkidle2' waits until the page is fully loaded and Cloudflare is done
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            const html = await page.content();

            const currentText = extractVisibleText(html);
            const previousText = websiteStates[url];

            if (currentText !== previousText) {
                const isInitialRun = (previousText === "");

                if (isInitialRun) {
                    console.log(`✅ Initial text fetched for ${url}`);
                } else {
                    console.log(`⚠️ Change detected on ${url}!`);
                }

                // Compare changes
                const differences = Diff.diffLines(previousText, currentText);
                let addedLines = [];
                let deletedLines = [];

                differences.forEach(part => {
                    const lines = part.value.split('\n').filter(l => l.trim() !== '');
                    if (part.added) addedLines.push(...lines);
                    if (part.removed) deletedLines.push(...lines);
                });

                // Format the time
                const currentTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });

                if (isInitialRun) {
                    const alertText =
                        `✅ <b>প্রাথমিক চেক সম্পন্ন!</b>\n\n` +
                        `🔗 <b>লিঙ্ক:</b> ${url}\n\n` +
                        `⏰ <b>সময়:</b> ${currentTime}`;
                    await sendTelegramAlert(alertText);
                } else {

                    const alertText =
                        `🔔 <b>ওয়েবসাইটে পরিবর্তন শনাক্ত হয়েছে!</b>\n\n` +
                        `🔗 <b>লিঙ্ক:</b> ${url}\n\n` +
                        `⏰ <b>সময়:</b> ${currentTime}\n\n`;

                    await sendTelegramAlert(alertText);
                }

                websiteStates[url] = currentText;
            } else {
                console.log(`Checked ${url} - No changes.`);
            }
        } catch (error) {
            console.error(`❌ Error checking ${url}:`, error.message);
        }
    }

    await browser.close();
    console.log("--- Cycle complete. Waiting 5 minutes... ---");
}

// ==========================================
//               MAIN LOOP
// ==========================================

async function startTracker() {
    console.log("🚀 Examify Notice Tracker is starting...");
    await sendTelegramAlert("✅ <b>Examify Notice Tracker is now online!</b>\nFetching initial data...");

    // Run immediately
    await checkWebsites();

    // Then run every 300 seconds
    setInterval(checkWebsites, 5 * 60 * 1000);
}

startTracker();