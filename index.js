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
        process.exit(1);
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

// Global browser instance for reuse (memory optimization)
let globalBrowser = null;

// ==========================================
//         LOAD INITIAL STATE FROM DB
// ==========================================
async function loadInitialStates() {
    try {
        const sites = await Site.find({});
        sites.forEach(site => {
            if (URLS_TO_TRACK.includes(site.url)) {
                websiteStates[site.url] = site.lastText || "";
                console.log(`✅ Loaded state for: ${site.url}`);
            }
        });
        console.log("✅ Initial states loaded from MongoDB");
    } catch (err) {
        console.error("❌ Error loading initial states:", err.message);
    }
}

// ==========================================
//         SAVE STATE TO DB
// ==========================================
async function saveStateToDb(url, text) {
    try {
        await Site.findOneAndUpdate(
            { url: url },
            { lastText: text },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`💾 Saved state to DB for: ${url}`);
    } catch (err) {
        console.error(`❌ Error saving state to DB for ${url}:`, err.message);
    }
}

// ==========================================
//    BROWSER MANAGEMENT (Memory Optimized)
// ==========================================
async function getBrowser() {
    // যদি browser আগে থেকে চালু থাকে এবং connected থাকে
    if (globalBrowser && globalBrowser.isConnected()) {
        return globalBrowser;
    }

    // নতুন browser launch করো (memory-optimized settings)
    try {
        globalBrowser = await puppeteer.launch({
            headless: "shell",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-component-extensions-with-background-pages',
                '--disable-features=TranslateUI,BlinkGenPropertyTrees',
                '--disable-ipc-flooding-protection',
                '--disable-renderer-backgrounding',
                '--enable-features=NetworkService,NetworkServiceInProcess',
                '--force-color-profile=srgb',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--disable-default-apps',
                '--no-zygote',
                '--single-process',
                // Cloudflare bypass করার জন্য extra flags
                '--disable-blink-features=AutomationControlled',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            ]
        });
        console.log("✅ Browser launched successfully");
        return globalBrowser;
    } catch (err) {
        console.error("❌ Failed to launch browser:", err.message);
        return null;
    }
}

// ==========================================
//            CORE FUNCTIONS
// ==========================================

async function sendTelegramAlert(message) {
    const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

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

    $('script, style, noscript, meta, header, footer').remove();

    const text = $('body').text();
    const cleanLines = text.split('\n')
        .map(line => line.trim())
        .filter(line => {
            const isInvalid =
                line.length === 0 ||
                line.includes("Ray ID:") ||
                line.includes("Performance and Security by CloudflarePrivacy") ||
                line.includes("Cloudflare");
            return !isInvalid;
        });

    return cleanLines.join('\n');
}

async function checkWebsites() {
    console.log("\n--- Starting checking cycle ---");

    const browser = await getBrowser();
    if (!browser) {
        console.error("❌ Browser not available, skipping this cycle");
        return;
    }

    let page;
    try {
        page = await browser.newPage();

        // Cloudflare bypass: Extra stealth measures
        await page.evaluateOnNewDocument(() => {
            // webdriver property hide করো
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });

            // Chrome runtime hide করো
            window.chrome = {
                runtime: {},
            };

            // Permissions query করো
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });

        // Memory optimization
        await page.setViewport({ width: 1280, height: 720 });
        await page.setRequestInterception(true);

        // Block unnecessary resources to save RAM (কিন্তু script allow করো Cloudflare এর জন্য)
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            // শুধু image আর font block করছি, CSS/JS চলতে দাও
            if (['image', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        for (const url of URLS_TO_TRACK) {
            try {
                console.log(`Navigating to: ${url}`);
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

                // Cloudflare bypass: Multiple attempts with increasing wait time
                let attempts = 0;
                let maxAttempts = 3;
                let bodyText = await page.evaluate(() => document.body.innerText);

                while ((bodyText.includes('security verification') ||
                    bodyText.includes('Cloudflare') ||
                    bodyText.includes('Performing security')) &&
                    attempts < maxAttempts) {

                    attempts++;
                    const waitTime = 15000 * attempts; // 15s, 30s, 45s
                    console.log(`⏳ Cloudflare detected on ${url}, attempt ${attempts}/${maxAttempts}, waiting ${waitTime / 1000} seconds...`);

                    await new Promise(resolve => setTimeout(resolve, waitTime));

                    // Page refresh করে আবার check করো
                    await page.reload({ waitUntil: 'networkidle2', timeout: 45000 });
                    bodyText = await page.evaluate(() => document.body.innerText);
                }

                // যদি এখনো Cloudflare page থাকে, warning দাও কিন্তু continue করো
                if (bodyText.includes('security verification') ||
                    bodyText.includes('Cloudflare') ||
                    bodyText.includes('Performing security')) {
                    console.log(`⚠️ Could not bypass Cloudflare on ${url} after ${maxAttempts} attempts. Saving what we have.`);
                }

                const html = await page.content();

                const currentText = extractVisibleText(html);
                const previousText = websiteStates[url];

                if (currentText !== previousText) {
                    const isInitialRun = (previousText === "");

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
                            `⏰ <b>সময়:</b> ${currentTime}`;
                        await sendTelegramAlert(alertText);
                    } else {
                        if (addedLines.length > 0 || deletedLines.length > 0) {
                            let diffMessage = "";

                            if (addedLines.length > 0) {
                                diffMessage += `➕ <b>নতুন কি যুক্ত হয়েছে:</b>\n${addedLines.slice(0, 5).join('\n')}\n\n`;
                            }

                            if (deletedLines.length > 0) {
                                diffMessage += `➖ <b>কি বাদ দেওয়া হয়েছে:</b>\n${deletedLines.slice(0, 5).join('\n')}\n\n`;
                            }

                            const alertText =
                                `🔔 <b>ওয়েবসাইটে পরিবর্তন শনাক্ত হয়েছে!</b>\n\n` +
                                `🔗 <b>লিঙ্ক:</b> ${url}\n\n` +
                                `⏰ <b>সময়:</b> ${currentTime}\n\n` +
                                diffMessage;

                            await sendTelegramAlert(alertText);
                        }
                    }

                    websiteStates[url] = currentText;
                    await saveStateToDb(url, currentText);

                } else {
                    console.log(`Checked ${url} - No changes.`);
                }
            } catch (error) {
                console.error(`❌ Error checking ${url}:`, error.message);
                continue;
            }
        }
    } catch (error) {
        console.error("❌ Error in checking cycle:", error.message);
    } finally {
        // Page cleanup to prevent memory leak
        if (page) {
            await page.close();
        }
    }

    console.log("--- Cycle complete. Waiting 10 minutes... ---");
}

// ==========================================
//               MAIN LOOP
// ==========================================

async function startTracker() {
    console.log("🚀 Examify Notice Tracker is starting...");

    await loadInitialStates();

    console.log("✅ Examify Notice Tracker is now online! Ready to track changes.");

    await checkWebsites();

    setInterval(checkWebsites, 10 * 60 * 1000);
}

startTracker();