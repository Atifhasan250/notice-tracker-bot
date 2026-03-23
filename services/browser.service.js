const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add the stealth plugin so Cloudflare doesn't block us
puppeteer.use(StealthPlugin());

// Global browser instance for reuse (memory optimization)
let globalBrowser = null;

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
            // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows এ Chrome এর path (যদি system-installed Chrome ব্যবহার করতে চাও)
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
                // Cloudflare bypass করার জন্য extra flags
                '--disable-blink-features=AutomationControlled',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            ]
        });

        // browser crash হলে globalBrowser reset করা হচ্ছে
        globalBrowser.on('disconnected', () => {
            console.log("⚠️ Browser disconnected. Will relaunch on next cycle.");
            globalBrowser = null;
        });

        console.log("✅ Browser launched successfully");
        return globalBrowser;
    } catch (err) {
        console.error("❌ Failed to launch browser:", err.message);
        return null;
    }
}

module.exports = { getBrowser };