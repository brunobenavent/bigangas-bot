import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Offer } from "./types.js";

const AMAZON_DEALS_URL = "https://www.amazon.es/deals";
const AFFILIATE_TAG = "bigangas-21";
const MIN_DISCOUNT = 30;
const SCROLL_COUNT = 5;

const OFFERS_PATH = resolve(process.cwd(), "data", "offers.json");

interface ScrapedProduct {
  title: string;
  originalPrice: number | null;
  discountPrice: number | null;
  discountPercent: number | null;
  imageUrl: string | null;
  productUrl: string;
  category: string;
}

async function main() {
  console.log("🚀 Iniciando scraper de Amazon...\n");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Evitar detección
  await page.setExtraHTTPHeaders({
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9",
  });

  try {
    await page.goto(AMAZON_DEALS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Esperar a que cargue contenido
    await page.waitForTimeout(5000);

    // Scroll para cargar más ofertas
    for (let i = 0; i < SCROLL_COUNT; i++) {
      await page.evaluate(() => window.scrollBy(0, 2000));
      await page.waitForTimeout(1500);
    }

    // Esperar extra para contenido lazy
    await page.waitForTimeout(3000);

    const products = await page.evaluate(() => {
      const results: Array<{
        title: string;
        originalPrice: string;
        discountPrice: string;
        discountPercent: string;
        imageUrl: string;
        productUrl: string;
        category: string;
      }> = [];

      // Selector de tarjetas en la página de ofertas de Amazon España
      const cards = document.querySelectorAll('[class*="ProductCard-module__card"]');

      cards.forEach((card) => {
        try {
          // Link del producto
          const linkEl = card.querySelector('a[href*="/dp/"]') as HTMLAnchorElement | null;
          const productUrl = linkEl?.href?.split("/ref=")[0] || "";

          // Título: extraer del texto de la tarjeta (el badge y título vienen juntos)
          const allText = card.textContent?.replace(/\s+/g, " ").trim() || "";
          // Limpiar prefijos de cuenta atrás del título
          const title = allText
            .replace(/^Finaliza en [\d:]+/i, "")
            .replace(/^-\d+%\s*Oferta\s*flash\s*/i, "")
            .replace(/^-\d+%\s*/i, "")
            .trim()
            .slice(0, 150);

          // Imagen
          const imgEl = card.querySelector("img");
          const imageUrl =
            imgEl?.getAttribute("src") ||
            imgEl?.getAttribute("data-src") ||
            "";

          // Porcentaje de descuento del badge
          const badgeEl = card.querySelector('[class*="style_filledRoundedBadgeLabel"], [class*="style_badgeContainer"]');
          const badgeText = badgeEl?.textContent?.match(/-(\d+)\s*%/) || null;
          const discountPercent = badgeText ? parseInt(badgeText[1]) : null;

          // Precios — buscar en el texto de la tarjeta
          const priceMatch = allText.match(/(\d+[,.]\d{2})\s*€/g);
          const prices = (priceMatch || []).map((p) =>
            parseFloat(p.replace("€", "").replace(",", ".").trim())
          );
          const discountPrice = prices.length > 0 ? Math.min(...prices) : null;
          const originalPrice = prices.length > 1 ? Math.max(...prices) : null;

          if (title && productUrl && productUrl.includes("/dp/")) {
            results.push({
              title,
              originalPrice: originalPrice ? originalPrice.toString() : "",
              discountPrice: discountPrice ? discountPrice.toString() : "",
              discountPercent: discountPercent ? discountPercent.toString() : "",
              imageUrl,
              productUrl,
              category: "",
            });
          }
        } catch {
          // Saltar tarjetas rotas
        }
      });

      return results;
    });

    console.log(`📦 Productos encontrados en bruto: ${products.length}`);

    // Convertir y filtrar
    const scraped: ScrapedProduct[] = products
      .map((p) => {
        const discountPrice = parseFloat(p.discountPrice) || null;
        const originalPrice = parseFloat(p.originalPrice) || null;
        const discountPercent = parseInt(p.discountPercent) || null;

        return {
          title: p.title,
          originalPrice,
          discountPrice,
          discountPercent,
          imageUrl: p.imageUrl || null,
          productUrl: p.productUrl,
          category: detectCategory(p.title),
        };
      })
      .filter((p) => {
        // Filtrar: mínimo 30% descuento
        if (p.discountPercent && p.discountPercent >= MIN_DISCOUNT) return true;
        // O si hay precio original y descuento > 30%
        if (p.originalPrice && p.discountPrice) {
          const dto = Math.round((1 - p.discountPrice / p.originalPrice) * 100);
          if (dto >= MIN_DISCOUNT) return true;
        }
        return false;
      })
      .slice(0, 20);

    console.log(`🔍 Después de filtrar (>${MIN_DISCOUNT}% dto): ${scraped.length}`);

    if (scraped.length === 0) {
      console.log("⚠️ No se encontraron ofertas que cumplan los criterios.");
      await browser.close();
      process.exit(0);
    }

    // Cargar ofertas existentes
    const existing: Offer[] = JSON.parse(readFileSync(OFFERS_PATH, "utf-8"));
    const existingUrls = new Set(
      existing.map((o) => {
        // Extraer el ID del producto de la URL para comparar
        const match = o.affiliateUrl.match(/\/dp\/(\w+)/);
        return match ? match[1] : o.affiliateUrl;
      })
    );

    // Convertir a Offer y filtrar duplicados
    const newOffers: Offer[] = scraped
      .filter((p) => {
        const match = p.productUrl.match(/\/dp\/(\w+)/);
        const productId = match ? match[1] : p.productUrl;
        return !existingUrls.has(productId);
      })
      .map((p, index) => ({
        id: `auto-${Date.now()}-${index}`,
        title: truncate(p.title, 120),
        description: p.discountPercent
          ? `🔥 ${p.discountPercent}% de descuento. ¡No te lo pierdas!`
          : p.originalPrice && p.discountPrice
            ? `Ahorro de ${Math.round((1 - p.discountPrice / p.originalPrice) * 100)}%. ¡Oferta flash!`
            : "Oferta flash por tiempo limitado.",
        originalPrice: p.originalPrice,
        discountPrice: p.discountPrice,
        platform: "amazon",
        affiliateUrl: `${p.productUrl}${p.productUrl.includes("?") ? "&" : "?"}tag=${AFFILIATE_TAG}`,
        category: p.category,
        imageUrl: p.imageUrl || undefined,
        published: false,
      }));

    console.log(`✅ Nuevas ofertas (sin duplicados): ${newOffers.length}`);

    if (newOffers.length === 0) {
      console.log("⚠️ Todas las ofertas encontradas ya existen. No hay nada nuevo.");
      await browser.close();
      process.exit(0);
    }

    // Mostrar preview
    console.log("\n📋 Preview de nuevas ofertas:");
    newOffers.forEach((o, i) => {
      const priceStr = o.originalPrice
        ? `${o.originalPrice}€ → ${o.discountPrice}€`
        : o.discountPrice
          ? `${o.discountPrice}€`
          : "precio en link";
      console.log(`  ${i + 1}. ${o.title.slice(0, 60)}... — ${priceStr}`);
    });

    // Agregar al JSON
    const updated = [...existing, ...newOffers];
    writeFileSync(OFFERS_PATH, JSON.stringify(updated, null, 2) + "\n");

    console.log(`\n💾 ${newOffers.length} ofertas agregadas a offers.json`);
    console.log(`📊 Total en catálogo: ${updated.length} (${updated.filter((o) => !o.published).length} sin publicar)`);
  } catch (error) {
    console.error("❌ Error en el scraper:", error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

function detectCategory(title: string): string {
  const lower = title.toLowerCase();
  if (/auricular|bluetooth|smartwatch|móvil|tablet|altavoz|auriculares|cascos/.test(lower))
    return "electrónica";
  if (/pesas|mancuerna|deporte|bici|pesa|fitness|ejercicio|gym/.test(lower)) return "deporte";
  if (/café|cafe|olla|sartén|cocina|batidora|freidora|thermomix|exprimidor/.test(lower))
    return "cocina";
  if (/bebé|bebe|niño|niña|chicco|dodot|pañal|toallita/.test(lower)) return "bebé";
  if (/zapato|zapatilla|camiseta|pantalón|chaqueta|polo|calvin|moda|sudadera/.test(lower))
    return "moda";
  if (/cepillo|crema|compeed|vitamina|oral-b|colgate|suplemento|parafarmacia/.test(lower))
    return "salud";
  if (/gato|perro|mascota|comedero|pienso|correa/.test(lower)) return "mascotas";
  if (/ventilador|colchón|colchon|almohada|toalla|sábana|cojín|estantería|mueble|decoración/.test(lower))
    return "hogar";
  return "hogar";
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3).trim() + "...";
}

main();
