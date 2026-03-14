import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 20_000; // 20 seconds base delay for 429 retries

export async function summarizeArticle(title: string, content: string): Promise<string | null> {
    const prompt = `
 You are a news syndicator for Maccabi Tel Aviv Basketball (מכבי תל אביב בכדורסל).
Summarize the following article snippet into a short, informative, and objective message in Hebrew.
The summary must be dry, factual, and strictly faithful to the original text without any personal opinions, excitement, or commentary.
Do not use enthusiastic language. Present the core facts clearly and concisely (no more than 3 sentences).

Title: ${title}
Content: ${content}

Please provide ONLY the summarized Hebrew text, ready to be sent to Telegram.
`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (error: any) {
            const is429 = error?.status === 429 || error?.statusText === 'Too Many Requests';

            if (is429 && attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * attempt;
                console.warn(`⚠️ Gemini quota exceeded (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`Error summarizing with Gemini (attempt ${attempt}/${MAX_RETRIES}):`, error);
                return null; // Signal caller to use fallback
            }
        }
    }

    return null;
}
