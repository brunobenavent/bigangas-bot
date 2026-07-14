import "dotenv/config";

export function getConfig() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHANNEL_ID = process.env.CHANNEL_ID;

  if (!BOT_TOKEN) throw new Error("❌ BOT_TOKEN no configurado en .env");
  if (!CHANNEL_ID) throw new Error("❌ CHANNEL_ID no configurado en .env");

  return { BOT_TOKEN, CHANNEL_ID } as const;
}
