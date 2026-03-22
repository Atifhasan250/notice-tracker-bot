# 🎓 Automated University Notice Tracker Bot

A robust, stealthy Telegram bot built with Node.js that monitors websites for text changes and sends real-time diff alerts. Originally designed to track university admission portals, this bot bypasses strict Cloudflare "403 Forbidden" blocks by utilizing a headless Chrome browser.

## ✨ Features

- **Stealth Scraping:** Uses `puppeteer-extra-plugin-stealth` to emulate a real human browser, effortlessly bypassing standard anti-bot protections.
- **Real-Time Diffs:** Doesn't just tell you a page changed—it extracts the visible text and shows you exactly what was added (🟢) and deleted (🔴).
- **Multi-Site Tracking:** Easily configurable array to track as many URLs as you need.
- **Anti-Ban Mechanics:** Implements randomized staggering and jitter between requests to avoid IP bans.
- **Cloud-Ready:** Includes a lightweight Express server, making it instantly deployable to free 24/7 hosting services like Render.

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Scraping:** Puppeteer, Cheerio
- **Bot API:** node-telegram-bot-api, Axios
- **Logic:** Diff (for text comparison)

## 🚀 Installation & Setup

**1. Clone the repository**
```bash
git clone https://github.com/yourusername/notice-tracker-bot.git
cd notice-tracker-bot
```

**2. Install dependencies**
```bash
npm install
```

**3. Environment Variables**
Create a `.env` file in the root directory and add your Telegram Bot Token (obtained from [@BotFather](https://t.me/botfather)):
```env
BOT_TOKEN=your_telegram_bot_token_here
```

**4. Configuration**
Open `bot.js` and update the following arrays to match your needs:
- `CHAT_IDS`: Add the Telegram Chat IDs of the users who should receive alerts.
- `URLS_TO_TRACK`: Add the website URLs you want to monitor.

## 💻 Usage

To run the bot locally:
```bash
npm start
```
The bot will immediately fetch the initial state of the websites, send a confirmation message to all configured Chat IDs, and begin checking for updates every 5 minutes.

## ☁️ Deployment (Free 24/7 Hosting)

This bot is configured to run flawlessly on [Render](https://render.com/).

1. Push your code to a private GitHub repository.
2. Create a new **Web Service** on Render and connect your repository.
3. In the Render dashboard, go to **Environment** and add your `BOT_TOKEN` variable.
4. Deploy the service.
5. *(Optional but Recommended)*: Use a free tool like [UptimeRobot](https://uptimerobot.com/) to ping the Render web URL every 5 minutes. This prevents the free server from going to sleep.

## ⚠️ Disclaimer

This tool is built for educational purposes and personal utility. Please respect the `robots.txt` and terms of service of the websites you are monitoring. Do not decrease the checking interval to a level that could inadvertently DDoS the target servers.