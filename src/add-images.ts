import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Offer } from "./types.js";

const OFFERS_PATH = resolve(process.cwd(), "data", "offers.json");

async function main() {
  const offers: Offer[] = JSON.parse(readFileSync(OFFERS_PATH, "utf-8"));
  const noImage = offers.filter((o) => !o.imageUrl);

  if (noImage.length === 0) {
    console.log("✅ Todas las ofertas ya tienen imagen.");
    process.exit(0);
  }

  console.log(`🔍 Buscando imágenes para ${noImage.length} ofertas...`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const offer of noImage) {
    const asin = offer.affiliateUrl.match(/\/dp\/(\w+)/)?.[1];
    if (!asin) continue;

    try {
      await page.goto(`https://www.amazon.es/dp/${asin}`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.waitForTimeout(3000);

      // Intentar múltiples selectores y el meta og:image
      const imageUrl = await page.evaluate(() => {
        // Meta og:image (siempre presente en Amazon)
        const ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
        if (ogImage?.content) return ogImage.content;

        // Imagen principal
        const selectors = [
          "#landingImage",
          "#imgBlkFront",
          ".a-dynamic-image",
          "img[data-old-hires]",
          "#main-image",
          ".imgTagWrapper img",
          "#img-canvas img",
        ];
        for (const sel of selectors) {
          const img = document.querySelector(sel) as HTMLImageElement | null;
          const src = img?.getAttribute("src") || img?.getAttribute("data-old-hires");
          if (src) return src;
        }

        return null;
      });

      if (imageUrl) {
        // Limpiar parámetros de dimensiones para una URL genérica
        const clean = imageUrl
          .replace(/\._.*_\./, ".")
          .replace(/\.[^.]+$/, "._AC_SL400_.jpg");
        offer.imageUrl = clean;
        console.log(`✅ ${offer.title.slice(0, 60)}`);
      } else {
        console.log(`⚠️  Sin imagen: ${offer.title.slice(0, 60)}`);
      }
    } catch (e: any) {
      console.log(`❌ Error: ${offer.title.slice(0, 60)} — ${e.message}`);
    }
  }

  await browser.close();

  const updated = noImage.filter((o) => o.imageUrl).length;
  writeFileSync(OFFERS_PATH, JSON.stringify(offers, null, 2) + "\n");
  console.log(`\n💾 ${updated} imágenes agregadas a offers.json`);
}

main();
