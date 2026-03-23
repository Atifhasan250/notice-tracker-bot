const express = require('express');
const app = express();

// This gives Render a webpage to look at so it doesn't shut your bot down
app.get('/', (req, res) => {
    res.send('Notice Bot is perfectly alive and tracking!');
});

module.exports = app;
