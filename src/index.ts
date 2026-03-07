import fs from 'fs';
import path from 'path';
import { scrapeLatestArticles } from './scraper';
import { summarizeArticle } from './gemini';
import { sendTelegramMessage } from './telegram';

const LAST_RUN_FILE = path.join(__dirname, '..', 'last-run.txt');
const FALLBACK_MINUTES = 60; // Fallback if no previous run timestamp exists

function getLastRunTime(): Date {
    try {
        if (fs.existsSync(LAST_RUN_FILE)) {
            const timestamp = fs.readFileSync(LAST_RUN_FILE, 'utf-8').trim();
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                console.log(`Last run timestamp found: ${timestamp}`);
                return date;
            }
        }
    } catch (err) {
        console.error('Error reading last run file:', err);
    }

    // Fallback: use current time minus FALLBACK_MINUTES
    const fallback = new Date(Date.now() - FALLBACK_MINUTES * 60 * 1000);
    console.log(`No previous run found, falling back to: ${fallback.toISOString()}`);
    return fallback;
}

function saveCurrentRunTime(): void {
    try {
        fs.writeFileSync(LAST_RUN_FILE, new Date().toISOString(), 'utf-8');
        console.log('Current run timestamp saved.');
    } catch (err) {
        console.error('Error saving run timestamp:', err);
    }
}

async function main() {
    const now = new Date();
    const since = getLastRunTime();

    console.log(`[${now.toISOString()}] Running monitoring cycle...`);
    console.log(`Looking for articles published after: ${since.toISOString()}`);

    try {
        const articles = await scrapeLatestArticles();
        let sentCount = 0;

        for (const article of articles) {
            if (!article.publishDate) {
                console.log(`Skipping (no date): ${article.title}`);
                continue;
            }

            const articleDate = new Date(article.publishDate);

            if (articleDate < since) {
                console.log(`Skipping (old — ${article.publishDate}): ${article.title}`);
                continue;
            }

            console.log(`✅ New article found (${article.publishDate}): ${article.title}`);

            if (article.content.length > 50) {
                const hebrewSummary = await summarizeArticle(article.title, article.content);
                await sendTelegramMessage(hebrewSummary, article.url);
                sentCount++;
                console.log(`Sent to Telegram: ${article.title}`);
            } else {
                console.log(`Skipping (insufficient content): ${article.url}`);
            }
        }

        console.log(`[${new Date().toISOString()}] Cycle complete. Sent ${sentCount} article(s).`);
    } catch (error) {
        console.error("Error during monitoring cycle:", error);
        process.exit(1);
    }

    // Save current run timestamp for next run
    saveCurrentRunTime();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
