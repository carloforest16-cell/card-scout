/**
 * Filtres de titres eBay — SOURCE UNIQUE, partagée entre le runtime
 * (lib/dealFinder.js, lib/auctionDeals.js, lib/dealsHottest.js) ET le smoke test
 * (scripts/smoke.mjs). Ce module doit rester PUR : aucun `import "server-only"`,
 * aucun alias `@/…`, aucune dépendance — pour que `node scripts/smoke.mjs`
 * puisse l'importer en relatif. Avant, ces règles étaient copiées à 3-4 endroits
 * et divergeaient (le smoke testait une règle plus faible que la prod).
 */

/**
 * Packs scellés, boxes, tins et lots multi-cartes — pas une carte précise.
 * Prudence faux positifs (audit review 2026-07-15) :
 *  - « Sealed » exige un suffixe Pack/Box/Case (sinon « PSA 10 Sealed » sur une
 *    slab serait exclu à tort) ;
 *  - pas de « Possible » (spéculation de grade « Possible PSA 10 » très courante
 *    sur les singles raw ; les packs « Possible YG » sont déjà pris par Fat Pack) ;
 *  - pluriel « cards » exigé (≠ « Series 2 Card »), « Break » scopé box/case/group,
 *    « (3) » capté seulement en tête de titre.
 */
export const PACK_BOX_RE =
  /\b(?:Fat\s*Pack|Retail\s*Pack|Blaster|Hobby\s*(?:Box|Pack)|Mega\s*Box|Factory\s*(?:Set|Sealed)|Sealed\s*(?:Pack|Box|Case)|Card\s+(?:Pack|Lot)|Hockey\s+Pack|Basketball\s+Pack|Football\s+Pack|Baseball\s+Pack)\b|\b\d+\s*cards\b|\b(?:Box|Case|Group)\s+Break\b|\bTin\b|^\s*\(\d+\)/i;

/**
 * @param {string | null | undefined} title
 * @returns {boolean}
 */
export function isPackOrLotTitle(title) {
  return PACK_BOX_RE.test(String(title ?? ""));
}

/**
 * Normalise un texte pour comparaison : retire les diacritiques et met en
 * minuscules. « Stützle » → « stutzle » (les vendeurs eBay écrivent en ASCII).
 * @param {string | null | undefined} s
 * @returns {string}
 */
export function normalizeName(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Le titre correspond-il bien au joueur cherché ? Corrige deux bugs de la V1
 * (substring brute du nom de famille) :
 *  1. accents — normalisation NFD → « Stutzle » matche « Stützle » ;
 *  2. frères — « Quinn Hughes » ne doit pas passer pour « Jack Hughes ».
 * Règle : nom de famille présent (normalisé) ET, si le prénom du joueur n'est
 * PAS dans le titre, le nom de famille ne doit pas être immédiatement précédé
 * d'un autre prénom (token alpha ≥ 3). Reste permissif sur les titres au nom
 * seul (« UD Hughes Rookie ») pour ne pas vider les sections.
 * @param {string | null | undefined} playerName
 * @param {string | null | undefined} title
 * @returns {boolean}
 */
export function titleMatchesPlayer(playerName, title) {
  const parts = normalizeName(playerName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return true;
  const last = parts[parts.length - 1];
  if (last.length < 3) return true; // nom trop court pour filtrer sans risque
  const nt = normalizeName(title);
  const idx = nt.indexOf(last);
  if (idx === -1) return false;
  const first = parts[0];
  if (first && nt.includes(first)) return true; // prénom complet présent → bon joueur
  const before = (nt.slice(0, idx).trim().split(/\s+/).pop() || "").replace(/[^a-z]/g, "");
  if (before.length >= 3 && before !== first) return false; // précédé d'un autre prénom → frère
  return true;
}
