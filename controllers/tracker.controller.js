const Diff = require('diff');
const { Site, TrackedUrl } = require('../models/tracker.model');
const { getBrowser } = require('../services/browser.service');
const { extractVisibleText } = require('../services/scraper.service');
const { sendTelegramAlert } = require('../services/telegram.service');

// Memory to store the last known text of each website
let websiteStates = {};

// ==========================================
//         LOAD INITIAL STATE FROM DB
// ==========================================
async function loadInitialStates() {
    try {
        const sites = await Site.find({});
        sites.forEach(site => {
            websiteStates[site.url] = site.lastText || "";
            console.log(`✅ Loaded state for: ${site.url}`);
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

async function checkWebsites() {
    console.log("\n--- Starting checking cycle ---");

    // প্রতিটি সাইকেলে DB থেকে URL লিস্ট নিয়ে আসা হচ্ছে
    const trackedUrls = await TrackedUrl.find({});
    const URLS_TO_TRACK = trackedUrls.map(t => t.url);

    if (URLS_TO_TRACK.length === 0) {
        console.log("⚠️ No URLs to track. Add URLs using /addurl command.");
        return;
    }

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

                const html = await page.content();

                // Cloudflare চেক করা হচ্ছে, থাকলে warning দেওয়া হবে কিন্তু track করার চেষ্টা চলবে
                const bodyText = await page.evaluate(() => document.body.innerText);
                if (bodyText.includes('security verification') ||
                    bodyText.includes('Cloudflare') ||
                    bodyText.includes('Performing security')) {
                    console.log(`🛡️ Cloudflare protected — tracking may not work for: ${url}`);
                }

                const currentText = extractVisibleText(html);
                const previousText = websiteStates[url] || "";

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
                                diffMessage += `🟢 <b>নতুন যোগ হয়েছে:</b>\n`;
                                diffMessage += `${addedLines.slice(0, 7).join('\n')}\n\n`;
                            }

                            if (deletedLines.length > 0) {
                                diffMessage += `🔴 <b>ডিলিট হয়েছে:</b>\n`;
                                diffMessage += `${deletedLines.slice(0, 3).join('\n')}\n\n`;
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
            try {
                await page.close();
            } catch (err) {
                console.error("⚠️ Could not close page (browser may have crashed):", err.message);
            }
        }
    }

    console.log("--- Cycle complete. Waiting 10 minutes... ---");
}

module.exports = { loadInitialStates, checkWebsites };