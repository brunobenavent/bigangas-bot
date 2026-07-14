import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Offer } from "./types.js";

const id = process.argv[2];

if (!id) {
  console.log("Uso: npm run expire <id>");
  console.log("Ejemplo: npm run expire 6");
  process.exit(1);
}

const offersPath = resolve(process.cwd(), "data", "offers.json");
const offers: Offer[] = JSON.parse(readFileSync(offersPath, "utf-8"));
const offer = offers.find((o) => o.id === id);

if (!offer) {
  console.log(`❌ No se encontró oferta con id="${id}"`);
  process.exit(1);
}

offer.expired = true;
offer.expiredAt = new Date().toISOString();

writeFileSync(offersPath, JSON.stringify(offers, null, 2) + "\n");

console.log(`✅ Caducada: ${offer.title.slice(0, 60)}`);
console.log("📝 Ejecutá git add data/offers.json && git commit -m 'expire' && git push");
