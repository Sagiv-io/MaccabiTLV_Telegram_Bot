import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN must be provided!');
}

const bot = new Telegraf(token);
const channelId = process.env.TELEGRAM_CHANNEL_ID!;

export async function sendTelegramMessage(text: string, url: string): Promise<void> {
    try {
        const message = `${text}\n\n🔗 [קרא עוד כאן](${url})`;
        await bot.telegram.sendMessage(channelId, message, {
            parse_mode: 'Markdown',
            link_preview_options: { is_disabled: false }
        });
        console.log("Message sent to Telegram successfully");
    } catch (error) {
        console.error("Error sending message to Telegram:", error);
    }
}
