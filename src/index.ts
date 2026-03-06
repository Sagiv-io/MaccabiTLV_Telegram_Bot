import { scrapeLatestArticles } from './scraper';
import { summarizeArticle } from './gemini';
import { sendTelegramMessage } from './telegram';

const INTERVAL_MINUTES = 15;

async function main() {
    const now = new Date();
    const since = new Date(now.getTime() - INTERVAL_MINUTES * 60 * 1000);

    console.log(`[${now.toISOString()}] Running monitoring cycle...`);
    console.log(`Looking for articles published after: ${since.toISOString()}`);

    try {
        const articles = await scrapeLatestArticles();
        let sentCount = 0;

        for (const article of articles) {
            // Skip articles without a publish date — can't verify they're new
            if (!article.publishDate) {
                console.log(`Skipping (no date): ${article.title}`);
                continue;
            }

            const articleDate = new Date(article.publishDate);

            // Skip articles published before the time window
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
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
