# 🎓 Examify Notice Tracker Bot

A production-grade Telegram bot built with Node.js that monitors university admission portals and news sites for content changes and delivers real-time alerts. Features a full admin system, role-based access control, MongoDB persistence, and stealth scraping to handle Cloudflare-protected websites.

---

## ✨ Features

- **Stealth Scraping** — Uses `puppeteer-extra-plugin-stealth` to emulate a real human browser and handle Cloudflare-protected pages
- **Smart Change Detection** — Only monitors the first 20 lines of each page, so noise from ads, footers, and dynamic content is ignored. Only meaningful top-section changes trigger alerts
- **Real-Time Alerts** — Shows the first 6 lines of what's new (🟢) and what was there before (🔴) in a clean Telegram message
- **Dynamic URL Management** — Add or remove tracked URLs live via bot commands, no redeployment needed. Removing a URL also cleans up its stored data from DB
- **Role-Based Access Control** — Three-tier system: Primary Admin, Secondary Admins, and Authorized Users
- **Full Admin Panel via Bot** — Manage users, URLs, and admins directly from Telegram commands
- **User Authorization Flow** — Users apply via `/apply`, admins approve instantly via inline button
- **Ban System** — Admins can ban/unban users; banned users cannot apply or interact with the bot
- **Crash Notifications** — Primary admin gets notified on bot startup, MongoDB disconnection, and unhandled errors
- **MongoDB Persistence** — All state (tracked URLs, users, admins, page snapshots) stored in MongoDB Atlas
- **Cloud-Ready** — Deployable to Render with a built-in Express keep-alive server

---

## 🏗️ Project Structure

```
├── index.js                           # Entry point — boots DB, server & tracker
├── app.js                             # Express app and routes
├── config/
│   └── config.js                      # Central config (BOT_TOKEN, ADMIN_CHAT_ID)
├── db/
│   └── db.js                          # MongoDB connection with event listeners
├── models/
│   ├── tracker.model.js               # Site (snapshots) + TrackedUrl schemas
│   ├── user.model.js                  # Authorized/pending/banned users schema
│   └── admin.model.js                 # Secondary admins schema
├── controllers/
│   ├── tracker.controller.js          # Core scraping and change detection logic
│   └── admin.controller.js            # All DB operations for users, admins, URLs
└── services/
    ├── bot.service.js                 # Telegram bot — all command handlers
    ├── browser.service.js             # Puppeteer browser lifecycle management
    ├── scraper.service.js             # HTML text extraction
    └── telegram.service.js            # Alert delivery with retry logic
```

---

## 🛠️ Tech Stack

| Purpose | Package |
|---|---|
| Scraping | `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `cheerio` |
| Bot API | `node-telegram-bot-api`, `axios` |
| Database | `mongoose` (MongoDB Atlas) |
| Server | `express` |
| Config | `dotenv` |

---

## 🚀 Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/Atifhasan250/notice-tracker-bot.git

cd notice-tracker-bot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create your `.env` file
```env
BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN

ADMIN_CHAT_ID=YOUR_TELEGRAM_CHAT_ID

MONGODB_URI=YOUR_MONGODB_ATLAS_URI

PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer
```

| Variable | Description |
|---|---|
| `BOT_TOKEN` | From [@BotFather](https://t.me/botfather) |
| `ADMIN_CHAT_ID` | Your Telegram chat ID — this is the primary admin |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `PUPPETEER_CACHE_DIR` | Required for Render deployment only |

### 4. Run locally
```bash
npm run dev     # with nodemon (auto-restart on changes)
npm start       # production
```

---

## 📦 First Time Setup (After Deployment)

Since URLs and users are stored in MongoDB, seed them via bot commands after the first deploy.

**Authorize yourself as a user:**
```
/adduser YOUR_CHAT_ID
```

**Add URLs to track:**
```
/addurl LINK
```

---

## 👥 User Roles & Access

### 🔑 Primary Admin (from `.env`)
- Full access to all commands including admin management
- Set once via `ADMIN_CHAT_ID` in `.env` — cannot be changed via bot
- Cannot be removed or banned by anyone

### 🛡️ Secondary Admins (stored in MongoDB)
- Can manage users and tracked URLs
- Cannot manage other admins
- Added and removed only by the primary admin
- Automatically added as an authorized user when promoted

### ✅ Authorized Users
- Receive all notice alerts
- Must be approved by an admin

### ⏳ Pending Users
- Have submitted `/apply` but not yet approved by an admin

### 🚫 Banned Users
- Cannot use `/start` or `/apply`
- Must be unbanned by an admin before reapplying

---

## 🤖 Bot Commands

### Public Commands
| Command | Description |
|---|---|
| `/start` | Welcome message and authorization status check |
| `/apply` | Submit an access request to all admins |

> Add only these two to BotFather. Admin commands are intentionally unlisted for security.

### Admin Commands (any admin)
| Command | Description |
|---|---|
| `/adminhelp` | View full admin command list |
| `/listusers` | List all authorized and pending users with names and chat IDs |
| `/approve <chatId>` | Approve a pending user |
| `/adduser <chatId>` | Authorize a user directly (no apply needed) |
| `/removeuser <chatId>` | Permanently delete a user from DB |
| `/ban <chatId>` | Ban a user from the bot |
| `/unban <chatId>` | Unban a previously banned user |
| `/listurls` | List all currently tracked URLs |
| `/addurl <url>` | Add a new URL to track |
| `/removeurl <url>` | Remove a URL and delete its stored data from DB |

### Primary Admin Only
| Command | Description |
|---|---|
| `/listadmins` | List primary and all secondary admins |
| `/addnewadmin <chatId>` | Promote a user to secondary admin |
| `/removeadmin <chatId>` | Demote admin back to authorized user |

---

## 🔔 Alert Format

When a tracked page's top section changes, all admins and authorized users receive:

```
🔔 ওয়েবসাইটে পরিবর্তন শনাক্ত হয়েছে!

🔗 লিঙ্ক: https://example.com
⏰ সময়: 3/23/2026, 9:02:30 AM

🟢 নতুন যোগ হয়েছে:
[first 6 lines of current top section]

🔴 ডিলিট হয়েছে:
[first 6 lines of previous top section]
```

> Alerts only fire when the **first 20 lines** of a page change. This filters out noise from ads, dynamic widgets, and page-wide updates — focusing only on the content that matters.

---

## ☁️ Deployment on Render

1. Push your code to a **private** GitHub repository
2. Create a new **Web Service** on Render and connect the repository
3. Set **Start Command** to `npm start`
4. Add all `.env` variables under **Environment** in the Render dashboard
5. Deploy

> ⚠️ Make sure only **1 instance** is running on Render (Settings → Scaling → Instances = 1). Running multiple instances causes a Telegram polling conflict (409 error).

> ⚠️ Do NOT run the bot locally while Render is active. Two instances polling at the same time will cause the same conflict.

> 💡 Use [UptimeRobot](https://uptimerobot.com/) to ping your Render URL every 5 minutes to prevent the free tier from sleeping.

---

## 🔒 Security Notes

- Never commit your `.env` file — make sure `.env` is listed in `.gitignore`
- Admin commands are not registered in BotFather, keeping them hidden from regular users
- Any non-admin who types an admin command receives: `⛔ Only admins can use this command.`
- Primary admin ID lives only in `.env` and cannot be modified via bot commands
- Admins cannot ban themselves, ban other admins, or remove each other from the user DB

---

## ⚠️ Disclaimer

This tool is built for educational purposes and personal utility. Please respect the `robots.txt` and terms of service of the websites you monitor. Do not set the checking interval to a level that could put excessive load on target servers.