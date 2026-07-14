import type { Offer } from "./types.js";

export async function publishOffer(
  offer: Offer,
  botToken: string,
  channelId: string
): Promise<void> {
  const message = formatOffer(offer);
  const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: channelId,
      text: message,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: false },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${response.status} — ${error}`);
  }

  console.log("✅ Mensaje enviado a Telegram");
}

const CATEGORY_EMOJI: Record<string, string> = {
  electrónica: "🌀",
  hogar: "🏠",
  deporte: "💪",
  cocina: "🍳",
  salud: "💊",
  moda: "👕",
  bebé: "👶",
  alimentación: "☕",
  mascotas: "🐾",
};

function formatOffer(offer: Offer): string {
  const emoji = CATEGORY_EMOJI[offer.category] || "🔥";
  const discount =
    offer.originalPrice && offer.discountPrice
      ? Math.round(
          (1 - offer.discountPrice / offer.originalPrice) * 100
        )
      : null;

  const priceLine =
    offer.discountPrice
      ? `💶 <b>Precio oferta: ${offer.discountPrice}€</b>` +
        (offer.originalPrice
          ? ` 💥 PVP normal: ${offer.originalPrice}€` +
            (discount ? ` <b>(-${discount}%)</b>` : "")
          : "")
      : "";

  const imageLine = offer.imageUrl ? `${offer.imageUrl}` : "";

  return [
    `${emoji} <b>${offer.title}</b> #Amazon`,
    imageLine,
    "",
    `🔥 ${offer.description}`,
    "",
    priceLine,
    "",
    `🔗 ${offer.affiliateUrl}`,
    "",
    "👁 Visto en @bigangas",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
