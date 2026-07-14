import { getConfig } from "./config.js";
import { publishOffer } from "./publisher.js";
import type { Offer } from "./types.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const config = getConfig();

  const offersPath = resolve(process.cwd(), "data", "offers.json");
  const offers: Offer[] = JSON.parse(readFileSync(offersPath, "utf-8"));

  const nextOffer = offers.find((o) => !o.published);

  if (!nextOffer) {
    console.log("🎉 Todas las ofertas han sido publicadas. ¡Toca curar más!");
    process.exit(0);
  }

  try {
    await publishOffer(nextOffer, config.BOT_TOKEN, config.CHANNEL_ID);

    nextOffer.published = true;
    nextOffer.publishedAt = new Date().toISOString();

    writeFileSync(offersPath, JSON.stringify(offers, null, 2) + "\n");

    console.log(`📢 Publicada: ${nextOffer.title}`);
    console.log("📝 Marcada como publicada en offers.json");
  } catch (error) {
    console.error("❌ Error al publicar:", error);
    process.exit(1);
  }
}

main();
