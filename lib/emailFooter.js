import { CONTACT_EMAIL, LEGAL_LOCATION } from "@/lib/legal";

/**
 * Ligne d'identification de l'expéditeur, obligatoire dans les courriels
 * promotionnels (LCAP) et utile dans tous les autres : nom, lieu, contact.
 * HTML inline (clients courriel), à placer dans le pied de chaque message.
 * @param {string} [color]
 */
export function senderIdentityHtml(color = "#94a3b8") {
  return `<span style="color:${color}">Card Metrics · ${LEGAL_LOCATION} · <a href="mailto:${CONTACT_EMAIL}" style="color:${color}">${CONTACT_EMAIL}</a></span>`;
}

/**
 * En-têtes de désabonnement en un clic (RFC 8058) — exigés par Gmail et Yahoo
 * pour les envois en nombre. L'URL doit accepter un POST sans corps utile
 * (voir app/api/digest/unsubscribe/route.js).
 * @param {string} unsubscribeUrl
 */
export function listUnsubscribeHeaders(unsubscribeUrl) {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
