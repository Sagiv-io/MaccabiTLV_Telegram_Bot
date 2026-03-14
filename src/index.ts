import fs from 'fs';
import path from 'path';
import { scrapeLatestArticles } from './scraper';
import { summarizeArticle } from './gemini';
import { sendTelegramMessage } from './telegram';

const LAST_RUN_FILE = path.join(__dirname, '..', 'last-run.txt');
const SENT_ARTICLES_FILE = path.join(__dirname, '..', 'sent-articles.json');
const FALLBACK_MINUTES = 60; // Fallback if no previous run timestamp exists
const SENT_ARTICLES_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

interface SentArticleEntry {
    url: string;
    sentAt: string; // ISO date string
}

function loadSentArticles(): SentArticleEntry[] {
    try {
        if (fs.existsSync(SENT_ARTICLES_FILE)) {
            const data = fs.readFileSync(SENT_ARTICLES_FILE, 'utf-8').trim();
            if (data) {
                const entries: SentArticleEntry[] = JSON.parse(data);
                // Clean up entries older than 48 hours
                const cutoff = Date.now() - SENT_ARTICLES_MAX_AGE_MS;
                const cleaned = entries.filter(e => new Date(e.sentAt).getTime() > cutoff);
                console.log(`Loaded ${entries.length} sent articles, ${cleaned.length} still within 48h window.`);
                return cleaned;
            }
        }
    } catch (err) {
        console.error('Error loading sent articles file:', err);
    }
    return [];
}

function saveSentArticles(entries: SentArticleEntry[]): void {
    try {
        fs.writeFileSync(SENT_ARTICLES_FILE, JSON.stringify(entries, null, 2), 'utf-8');
        console.log(`Saved ${entries.length} sent article(s) to history.`);
    } catch (err) {
        console.error('Error saving sent articles file:', err);
    }
}

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
    const sentArticles = loadSentArticles();
    const sentUrls = new Set(sentArticles.map(e => e.url));

    console.log(`[${now.toISOString()}] Running monitoring cycle...`);
    console.log(`Looking for articles published after: ${since.toISOString()}`);

    try {
        const articles = await scrapeLatestArticles();
        let sentCount = 0;

        for (const article of articles) {
            try {
                if (!article.publishDate) {
                    console.log(`Skipping (no date): ${article.title}`);
                    continue;
                }

                const articleDate = new Date(article.publishDate);

                if (articleDate < since) {
                    console.log(`Skipping (old — ${article.publishDate}): ${article.title}`);
                    continue;
                }

                // Dedup: skip if already sent
                if (sentUrls.has(article.url)) {
                    console.log(`Skipping (already sent): ${article.title}`);
                    continue;
                }

                console.log(`✅ New article found (${article.publishDate}): ${article.title}`);

                if (article.content.length > 50) {
                    const hebrewSummary = await summarizeArticle(article.title, article.content);

                    if (hebrewSummary) {
                        await sendTelegramMessage(hebrewSummary, article.url);
                    } else {
                        // Fallback: send the article title without AI summary
                        console.warn(`⚠️ Gemini summary failed for "${article.title}", sending with title only.`);
                        await sendTelegramMessage(article.title, article.url);
                    }

                    // Track as sent
                    sentArticles.push({ url: article.url, sentAt: new Date().toISOString() });
                    sentUrls.add(article.url);

                    sentCount++;
                    console.log(`Sent to Telegram: ${article.title}`);
                } else {
                    console.log(`Skipping (insufficient content): ${article.url}`);
                }
            } catch (articleError) {
                console.error(`❌ Error processing article "${article.title}":`, articleError);
                // Continue to next article
            }
        }

        console.log(`[${new Date().toISOString()}] Cycle complete. Sent ${sentCount} article(s).`);
    } catch (error) {
        console.error("Error during monitoring cycle:", error);
        process.exit(1);
    }

    // Save state for next run
    saveCurrentRunTime();
    saveSentArticles(sentArticles);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
