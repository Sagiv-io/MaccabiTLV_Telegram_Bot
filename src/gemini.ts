import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function summarizeArticle(title: string, content: string): Promise<string> {
    const prompt = `
 You are a news syndicator for Maccabi Tel Aviv Basketball (מכבי תל אביב בכדורסל).
Summarize the following article snippet into a short, informative, and objective message in Hebrew.
The summary must be dry, factual, and strictly faithful to the original text without any personal opinions, excitement, or commentary.
Do not use enthusiastic language. Present the core facts clearly and concisely (no more than 3 sentences).

Title: ${title}
Content: ${content}

Please provide ONLY the summarized Hebrew text, ready to be sent to Telegram.
`;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error("Error summarizing with Gemini:", error);
        throw error;
    }
}
