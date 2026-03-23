const cheerio = require('cheerio');

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

module.exports = { extractVisibleText };
