import { chromium, Browser } from 'playwright';

export interface ScrapedArticle {
    url: string;
    title: string;
    content: string;
    publishDate?: string; // ISO date string if available
}

const TARGET_URLS = [
    'https://www.sport5.co.il/team.aspx?FolderID=2592',
    'https://www.sport5.co.il/world.aspx?FolderId=4467',
    'https://www.one.co.il/Basketball/team/1219',
    'https://sports.walla.co.il/team/869',
    'https://www.israelhayom.co.il/tag/%D7%9E%D7%9B%D7%91%D7%99-%D7%AA%D7%9C-%D7%90%D7%91%D7%99%D7%91-%D7%91%D7%9B%D7%93%D7%95%D7%A8%D7%A1%D7%9C',
    'https://www.ynet.co.il/topics/%D7%9E%D7%9B%D7%91%D7%99_%D7%AA%D7%9C_%D7%90%D7%91%D7%99%D7%91_%D7%91%D7%9B%D7%93%D7%95%D7%A8%D7%A1%D7%9C'
];

export async function scrapeLatestArticles(): Promise<ScrapedArticle[]> {
    const articles: ScrapedArticle[] = [];
    console.log("Starting scraper...");

    let browser: Browser | null = null;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        for (const url of TARGET_URLS) {
            try {
                console.log(`Navigating to ${url}...`);
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // Generic logic: find the first 2-3 links that look like articles
                const articleLinks = await page.evaluate((url) => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const validLinks: { href: string; title: string }[] = [];
                    for (const link of links) {
                        const href = link.href;

                        // Extract text from link or any nested elements (like div/span/h3)
                        let text = link.innerText.trim();
                        if (!text) {
                            text = link.textContent?.trim() || link.getAttribute('aria-label') || link.getAttribute('title') || '';
                        }

                        if (href && href.startsWith('http') && !href.includes('tag') && !href.includes('author') && !href.includes('category')) {
                            // Only include if text looks like a valid title with keywords or if it's Israel Hayom
                            // Israel Hayom links sometimes just have an ID or specific structure without "maccabi" in text
                            if (text.length > 15 &&
                                (text.includes('מכבי תל אביב') || text.includes('מכבי ת"א') || (url.includes('israelhayom') && href.includes('israelhayom.co.il/sport/')))) {
                                if (!validLinks.some(v => v.href === href)) {
                                    validLinks.push({ href: href, title: text });
                                }
                            }
                        }
                    }
                    return validLinks.slice(0, 3);
                }, url);

                console.log(`Found ${articleLinks.length} potential articles on ${url}`);

                for (const link of articleLinks) {
                    try {
                        const newPage = await context.newPage();
                        // Increase timeout for sites like ONE
                        await newPage.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 45000 });

                        // Extract article content and try to find publish date
                        const articleData = await newPage.evaluate(() => {
                            // Extract paragraphs
                            const paragraphs = Array.from(document.querySelectorAll('p'));
                            const content = paragraphs
                                .map(p => p.innerText.trim())
                                .filter(text => text.length > 30)
                                .slice(0, 5)
                                .join('\n');

                            // Try to extract publish date from common meta tags and elements
                            let publishDate: string | null = null;

                            // Check meta tags (most reliable)
                            const metaSelectors = [
                                'meta[property="article:published_time"]',
                                'meta[name="publishdate"]',
                                'meta[name="publish-date"]',
                                'meta[property="og:published_time"]',
                                'meta[name="date"]',
                                'meta[itemprop="datePublished"]'
                            ];

                            for (const selector of metaSelectors) {
                                const meta = document.querySelector(selector);
                                if (meta) {
                                    publishDate = meta.getAttribute('content');
                                    if (publishDate) break;
                                }
                            }

                            // Specific selectors for different sites to handle missing meta tags
                            if (!publishDate) {
                                // Ynet text fallback (e.g. 09:05 | 04.03.26 | ספורט ynet)
                                const ynetDateMatch = document.body.innerText.match(/(\d{2}:\d{2})\s*\|\s*(\d{2}\.\d{2}\.\d{2})/);
                                if (ynetDateMatch) {
                                    const [, timePhrase, datePhrase] = ynetDateMatch; // 09:05, 04.03.26
                                    const [day, month, yearPart] = datePhrase.split('.');
                                    const fullYear = `20${yearPart}`; // Assuming 20xx
                                    publishDate = `${fullYear}-${month}-${day}T${timePhrase}:00Z`;
                                }
                            }

                            if (!publishDate) {
                                const timeEl = document.querySelector('time[datetime]');
                                if (timeEl) {
                                    publishDate = timeEl.getAttribute('datetime');
                                }
                            }

                            // Fix cases where publishDate is not ISO (like Walla: "2026-03-06 12:20" or "12:20 06/03/2026")
                            if (publishDate && !publishDate.includes('T')) {
                                // E.g., "2026-03-06 12:20"
                                const wallaIsoMatch = publishDate.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
                                if (wallaIsoMatch) {
                                    publishDate = `${wallaIsoMatch[1]}T${wallaIsoMatch[2]}:00Z`;
                                } else {
                                    // E.g., "12:20 06/03/2026"
                                    const wallaHebrewMatch = publishDate.match(/(\d{2}:\d{2})\s+(\d{2}\/\d{2}\/\d{4})/);
                                    if (wallaHebrewMatch) {
                                        const [, timePhrase, datePhrase] = wallaHebrewMatch;
                                        const [day, month, fullYear] = datePhrase.split('/');
                                        publishDate = `${fullYear}-${month}-${day}T${timePhrase}:00Z`;
                                    }
                                }
                            }

                            // ONE fallback (often inside a span with class "article-date" or similar)
                            if (!publishDate) {
                                // Find any span that might have the date, since :contains is not standard CSS
                                const spans = Array.from(document.querySelectorAll('span, p, .article-date, .date, div'));
                                for (const el of spans) {
                                    if (el.textContent) {
                                        // Look for something like "05/03/2026 - 20:30"
                                        const oneDateMatch = el.textContent.match(/(\d{2}\/\d{2}\/\d{4})(?:\s*-\s*(\d{2}:\d{2}))?/);
                                        if (oneDateMatch) {
                                            const [, datePhrase, timePhrase] = oneDateMatch;
                                            const [day, month, fullYear] = datePhrase.split('/');
                                            const time = timePhrase ? `${timePhrase}:00` : '00:00:00';
                                            publishDate = `${fullYear}-${month}-${day}T${time}Z`;
                                            break;
                                        }
                                    }
                                }
                            }

                            return { content, publishDate };
                        });

                        articles.push({
                            url: link.href,
                            title: link.title,
                            content: articleData.content,
                            publishDate: articleData.publishDate || undefined
                        });

                        await newPage.close();
                    } catch (err) {
                        console.error(`Failed to scrape article ${link.href}:`, err);
                    }
                }
            } catch (err) {
                console.error(`Failed to load source ${url}:`, err);
            }
        }
    } catch (err) {
        console.error("Scraper encountered a critical error:", err);
    } finally {
        if (browser) {
            await browser.close();
        }
    }

    return articles;
}
