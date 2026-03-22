require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const axios = require('axios');
const Diff = require('diff');
const express = require('express');
const app = express();
const mongoose = require('mongoose');


// ==========================================
//             MONGODB CONNECTION
// ==========================================
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB Atlas");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        process.exit(1); // কানেকশন না হলে অ্যাপ বন্ধ করে দিবে
    }
}
connectDB();

const SiteSchema = new mongoose.Schema({
    url: { type: String, unique: true },
    lastText: String
});
const Site = mongoose.model('Site', SiteSchema);


// This gives Render a webpage to look at so it doesn't shut your bot down
app.get('/', (req, res) => {
    res.send('Notice Bot is perfectly alive and tracking!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 web server running on port ${PORT}`);
});


// Add the stealth plugin so Cloudflare doesn't block us
puppeteer.use(StealthPlugin());

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

    // অপ্রয়োজনীয় এলিমেন্ট রিমুভ করা
    $('script, style, noscript, meta, header, footer').remove();

    const text = $('body').text();
    const cleanLines = text.split('\n')
        .map(line => line.trim())
        .filter(line => {
            // ফিল্টার: খালি লাইন এবং Cloudflare/Ray ID যুক্ত লাইন বাদ দেওয়া
            const isInvalid =
                line.length === 0 ||
                line.includes("Ray ID:") ||
                line.includes("Cloudflare");
            return !isInvalid;
        });

    return cleanLines.join('\n');
}

async function checkWebsites() {
    console.log("\n--- Starting checking cycle ---");

    // Launch an actual invisible browser
    const browser = await puppeteer.launch({
        headless: "shell",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // এটি Render-এর মেমোরি ক্রাশ রোধ করে
            '--disable-gpu'
        ]
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

                // Compare changes
                const differences = Diff.diffLines(previousText, currentText);
                let addedLines = [];
                let deletedLines = [];

                differences.forEach(part => {
                    const lines = part.value.split('\n').filter(l => l.trim() !== '');
                    if (part.added) addedLines.push(...lines);
                    if (part.removed) deletedLines.push(...lines);
                });

                const currentTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });

                if (isInitialRun) {
                    const alertText =
                        `✅ <b>প্রাথমিক চেক সম্পন্ন!</b>\n\n` +
                        `🔗 <b>লিঙ্ক:</b> ${url}\n\n` +
                        `⏰ <b>সময়:</b> ${currentTime}`;
                    await sendTelegramAlert(alertText);
                } else {
                    // শুধুমাত্র তখনই মেসেজ দিবে যদি সত্যিই কোনো লাইন যোগ বা বিয়োগ হয়
                    if (addedLines.length > 0 || deletedLines.length > 0) {
                        let diffMessage = "";

                        if (addedLines.length > 0) {
                            diffMessage += `➕ <b>নতুন কি যুক্ত হয়েছে:</b>\n${addedLines.slice(0, 5).join('\n')}\n\n`;
                        }

                        if (deletedLines.length > 0) {
                            diffMessage += `➖ <b>কি বাদ দেওয়া হয়েছে:</b>\n${deletedLines.slice(0, 5).join('\n')}\n\n`;
                        }

                        const alertText =
                            `🔔 <b>ওয়েবসাইটে পরিবর্তন শনাক্ত হয়েছে!</b>\n\n` +
                            `🔗 <b>লিঙ্ক:</b> ${url}\n\n` +
                            `⏰ <b>সময়:</b> ${currentTime}\n\n` +
                            diffMessage;

                        await sendTelegramAlert(alertText);
                    }
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
    console.log("--- Cycle complete. Waiting 10 minutes... ---");
}

// ==========================================
//               MAIN LOOP
// ==========================================

async function startTracker() {
    console.log("🚀 Examify Notice Tracker is starting...");
    await sendTelegramAlert("✅ <b>Examify Notice Tracker is now online!</b>\nFetching initial data...");

    // Run immediately
    await checkWebsites();

    // Then run every 600 seconds
    setInterval(checkWebsites, 10 * 60 * 1000);
}

startTracker();