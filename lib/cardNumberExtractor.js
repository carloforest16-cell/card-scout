/**
 * Extracteur de numéros de carte depuis les titres eBay.
 *
 * Sport-readiness note (PR 14) :
 *  Les règles ci-dessous sont SPÉCIFIQUES AU HOCKEY NHL :
 *    - young-guns / young-guns-renewed (Upper Deck Series 1/2)
 *    - canvas (UD Canvas inserts)
 *    - opc (O-Pee-Chee — hockey only)
 *    - tim-hortons (Canadian hockey-only promo)
 *    - the-cup (UD The Cup — hockey)
 *    - clear-cut / spx / artifacts / black-diamond / sp-authentic — UD hockey lines
 *
 *  Génériques (à conserver pour tout sport) :
 *    - parallel, auto, patch, base, refractor (basketball/football)
 *
 *  Pour ajouter un sport, voir lib/sportConfig.js et créer une variante
 *  CARD_TYPE_RULES_NBA / NFL / MLB indexée par sport. La fonction
 *  detectCardGroup acceptera alors un param `sport` pour choisir la bonne table.
 */
const CARD_TYPE_RULES_NHL = [
  { type: "parallel", label: "parallel", re: /\bPARALLEL\b/i },
  {
    type: "young-guns-renewed",
    label: "young guns renewed",
    re: /\bYoung\s*Guns\s+Renewed\b|\bYG\s+Renewed\b/i,
  },
  {
    type: "young-guns",
    label: "young guns",
    re: /\bYoung\s*Guns\b|\bYG\b/i,
  },
  { type: "canvas", label: "canvas", re: /\b(?:UD\s*)?Canvas\b/i },
  { type: "auto", label: "auto", re: /\bAuto(?:graph)?s?\b|\bSigned\b|\bRPA\b/i },
  { type: "patch", label: "patch", re: /\bPatch\b/i },
  { type: "credentials", label: "credentials", re: /\bCredentials\b/i },
  { type: "spx", label: "spx", re: /\bSPx\b/i },
  { type: "allure", label: "allure", re: /\bAllure\b/i },
  { type: "artifacts", label: "artifacts", re: /\bArtifacts\b/i },
  { type: "mvp", label: "mvp", re: /\bMVP\b/i },
  { type: "opc", label: "opc", re: /\bO-?Pee-?Chee\b|\bOPC\b/i },
  { type: "premier", label: "premier", re: /\bPremier\b/i },
  { type: "trilogy", label: "trilogy", re: /\bTrilogy\b/i },
  { type: "clear-cut", label: "clear cut", re: /\bClear[\s-]?Cut\b|\bAcetate\b/i },
  { type: "exclusives", label: "exclusives", re: /\bExclusives\b/i },
  { type: "retro", label: "retro", re: /\bRetro\b/i },
  { type: "dazzlers", label: "dazzlers", re: /\bDazzlers\b/i },
  { type: "outburst", label: "outburst", re: /\bOutburst\b/i },
  { type: "ice", label: "ice", re: /\bUD\s*Ice\b|\bUpper\s*Deck\s*Ice\b/i },
  { type: "sp-authentic", label: "sp authentic", re: /\bSP\s*Authentic\b|\bSP\s*Auth\b/i },
  { type: "sp-game-used", label: "sp game used", re: /\bSP\s*Game\s*Used\b/i },
  { type: "tim-hortons", label: "tim hortons", re: /\bTim\s*Hortons\b/i },
  { type: "black-diamond", label: "black diamond", re: /\bBlack\s*Diamond\b/i },
  { type: "the-cup", label: "the cup", re: /\bThe\s*Cup\b/i },
  { type: "base", label: "base", re: /\bUpper\s*Deck\b|\bUD\b/i },
];

/** Arrête l'extraction du nom joueur avant ville / équipe NHL connue. */
const TEAM_CITY_STOP_RE =
  /\b(?:EDMONTON|CALGARY|MONTREAL|TORONTO|VANCOUVER|OTTAWA|WINNIPEG|BOSTON|CHICAGO|DETROIT|BUFFALO|MINNESOTA|COLORADO|DALLAS|ST\.?\s*LOUIS|NASHVILLE|COLUMBUS|FLORIDA|TAMPA|WASHINGTON|PHILADELPHIA|PITTSBURGH|NEW\s+JERSEY|NEW\s+YORK|NY\s+RANGERS|NY\s+ISLANDERS|ISLANDERS|RANGERS|OILERS|FLAMES|CANADIENS|MAPLE\s+LEAFS|JETS|SENATORS|CANUCKS|BRUINS|BLACKHAWKS|RED\s+WINGS|SABRES|WILD|AVALANCHE|STARS|BLUES|PREDATORS|BLUE\s+JACKETS|PANTHERS|LIGHTNING|CAPITALS|FLYERS|DEVILS|KRAKEN|GOLDEN\s+KNIGHTS|COYOTES|UTAH|ANAHEIM|DUCKS|KINGS|SHARKS|ARIZONA|VEGAS)\b/i;

/** Arrête l'extraction du nom joueur avant ces ancres produit / grading. */
const PLAYER_NAME_STOP_RE =
  /\b(?:Upper\s+Deck|\bUD\b|O-?Pee-?Chee|\bOPC\b|Young\s+Guns|\bYG\b|PSA|BGS|SGC|Beckett|Canvas|Credentials|SPx|Allure|Artifacts|\bMVP\b|Premier|Trilogy|Clear\s+Cut|Acetate|Exclusives|Retro|Dazzlers|Outburst|Autograph|Auto(?:graph)?s?|Signed|\bRPA\b|Patch|Mosaic|Prizm|\bSP\b|\bSPA\b|Future\s+Watch|The\s+Cup|\bICE\b|Select|Chronology|Extended|Series|\bHockey\b|\bCard\b|\bCards\b|\bRC\b|\bRookie\b|\b20\d{2})\b/i;

const NOT_A_NAME =
  /^(fractal|parallel|gold|silver|ruby|rainbow|acetate|insert|base|rookie|hockey|upper|deck|series|tim|hortons|fanatics|skybox|metal|universe|premium|spectrum|holo|retro|canvas|classic|vintage|limited|exclusive|certified|authentic|premier|allure|artifacts|credentials|trilogy|outburst|dazzlers|opc|mvp|spx)$/i;

/**
 * Map sport → règles de types de carte. Sport-readiness (PR 14).
 * Pour ajouter un sport : ajouter CARD_TYPE_RULES_NBA = [...] et l'enregistrer ici.
 */
const CARD_TYPE_RULES_BY_SPORT = {
  NHL: CARD_TYPE_RULES_NHL,
};

/**
 * Retourne les règles applicables à un sport. Sans param → NHL.
 * @param {string} [sport]
 */
export function getCardTypeRules(sport = "NHL") {
  return CARD_TYPE_RULES_BY_SPORT[String(sport).toUpperCase()] ?? CARD_TYPE_RULES_NHL;
}

/**
 * @param {string} title
 * @param {string} [sport]
 */
function detectCardType(title, sport = "NHL") {
  const rules = getCardTypeRules(sport);
  const hit = rules.find((rule) => rule.re.test(title));
  return hit ? { cardType: hit.type, label: hit.label } : null;
}

/**
 * @param {string} title
 */
function detectYear(title) {
  const range = title.match(/\b(20\d{2})-(?:20)?(\d{2})\b/);
  if (range) return `${range[1]}-${range[2]}`;
  const single = title.match(/\b(20\d{2})\b/);
  return single ? single[1] : null;
}

/**
 * @param {string} title
 * @param {RegExp[]} patterns
 */
function findEarliestStopIndex(title, patterns) {
  let cut = title.length;
  for (const re of patterns) {
    const m = re.exec(title);
    if (m && m.index < cut) cut = m.index;
  }
  return cut;
}

/**
 * @param {string} title
 * @returns {string | null}
 */
function detectPlayerLastName(title) {
  const cut = findEarliestStopIndex(title, [
    TEAM_CITY_STOP_RE,
    PLAYER_NAME_STOP_RE,
  ]);
  const head = title.slice(0, cut).trim();
  if (!head) return null;

  const cleaned = head.replace(/^[^A-Za-z]+/, "").trim();
  const words = cleaned.match(/\b[A-Za-z][A-Za-z'.-]*\b/g) ?? [];
  if (words.length === 0) return null;

  let last = words[words.length - 1];
  if (/^[A-Za-z]\.?$/i.test(last) && words.length >= 2) {
    last = words[words.length - 2];
  }
  if (NOT_A_NAME.test(last) && words.length >= 2) {
    last = words[words.length - 2];
  }

  const normalized = last.toLowerCase();
  return normalized.length >= 2 ? normalized : null;
}

/**
 * @param {string} title
 */
function detectGrade(title) {
  const m = title.match(/\b(PSA|BGS|SGC)\s*(10|9(?:\.5)?|8)\b/i);
  if (!m) return null;
  return {
    grade: `${m[1].toUpperCase()} ${m[2]}`,
    fingerprintPart: `${m[1].toLowerCase()}${m[2].replace(".", "")}`,
    queryPart: `${m[1].toLowerCase()} ${m[2]}`,
  };
}

/**
 * @param {string} title
 * @param {string | null} [_cardType]
 */
function detectCardCode(title, _cardType) {
  const alphaCode =
    title.match(/\b([A-Z]{1,5}-\d{1,4})\b/i) ??
    title.match(/\b([A-Z]{1,5}\d{1,4})\b/i);
  if (alphaCode) return alphaCode[1].toUpperCase();

  const hashAlpha = title.match(/#\s*([A-Z]+\d{1,4}|[A-Z]+-\d{1,4})\b/i);
  if (hashAlpha) return hashAlpha[1].toUpperCase();

  const parallelNum = title.match(
    /(?:#|(?<=\s))(\d{3,4})\s+(?:PARALLEL|GOLD|SILVER|RUBY|RAINBOW)\b/i
  );
  if (parallelNum) return parallelNum[1];

  const numeric = title.match(/#\s*(\d{3,4})\b/i);
  if (numeric) return numeric[1];

  return null;
}

/**
 * @param {string} title
 */
function detectPrintRun(title) {
  // Print-runs courants UD/Topps. Note: les nombres sont triés par longueur
  // décroissante pour que la regex match /5000 avant /500, /299 avant /29, etc.
  const m = title.match(
    /\/(?:5000|3000|2500|2000|1500|1000|999|750|699|599|500|499|399|349|299|275|250|225|199|175|150|149|125|100|99|75|50|49|35|33|29|25|23|20|15|10|8|5|3|2|1)\b/i
  );
  return m ? m[0] : null;
}

/**
 * @param {string} title
 */
function detectSearchModifier(title) {
  if (/\bFractal\b/i.test(title)) return "fractal";
  return null;
}

/**
 * Noms de SETS Upper Deck/Topps. Détectés en plus du cardType pour préciser
 * la requête 130point (ex: "patch" → "patch premier" → comps homogènes).
 */
const SET_NAMES = [
  { label: "ultimate collection", re: /\bUltimate\s+(?:Collection|Memorabilia|Edition)\b/i },
  { label: "the cup", re: /\bThe\s*Cup\b/i },
  { label: "exquisite", re: /\bExquisite\b/i },
  { label: "premier", re: /\bPremier\b/i },
  { label: "artifacts", re: /\bArtifacts\b/i },
  { label: "trilogy", re: /\bTrilogy\b/i },
  { label: "ud ice", re: /\bUD\s*Ice\b|\bUpper\s*Deck\s*Ice\b/i },
  { label: "sp authentic", re: /\bSP\s*Authentic\b|\bSP\s*Auth\b/i },
  { label: "sp game used", re: /\bSP\s*Game\s*Used\b/i },
  { label: "black diamond", re: /\bBlack\s*Diamond\b/i },
  { label: "mvp", re: /\b(?:Upper\s+Deck\s+)?MVP\b/i },
  { label: "tim hortons", re: /\bTim\s*Hortons\b/i },
  { label: "synergy", re: /\bSynergy\b/i },
  { label: "stature", re: /\bStature\b/i },
  { label: "chronology", re: /\bChronology\b/i },
  { label: "extended series", re: /\bExtended\s+Series\b/i },
  { label: "opc platinum", re: /\bO-?Pee-?Chee\s+Platinum\b|\bOPC\s+Platinum\b/i },
  { label: "metal universe", re: /\bMetal\s+Universe\b/i },
  { label: "flair", re: /\bFlair(?:\s+NHL)?\b/i },
  { label: "parkhurst", re: /\bParkhurst\b/i },
  { label: "credentials", re: /\bCredentials\b/i },
  { label: "spx", re: /\bSPx\b/i },
  { label: "allure", re: /\bAllure\b/i },
];

/**
 * @param {string} title
 * @returns {string | null}
 */
function detectSetName(title) {
  for (const s of SET_NAMES) if (s.re.test(title)) return s.label;
  return null;
}

/**
 * Inserts nommés spécifiques (Premier, SP Authentic, etc.) qui définissent
 * une carte distincte au sein d'un même set.
 */
const NAMED_INSERTS = [
  { label: "on the forefront", re: /\bOn\s+the\s+Forefront\b/i },
  { label: "grand opus", re: /\bGrand\s+Opus\b/i },
  { label: "foundations", re: /\bFoundations\b/i },
  { label: "mega patch", re: /\bMega\s*Patch\b/i },
  { label: "rookie patch auto", re: /\bRookie\s+Patch\s+Auto(?:graph)?s?\b|\bRPA\b/i },
  { label: "future watch", re: /\bFuture\s+Watch\b/i },
  { label: "glimpses", re: /\bGlimpses\b/i },
  { label: "roots of greatness", re: /\bRoots\s+of\s+Greatness\b/i },
  { label: "blue line", re: /\bBlue\s+Line\b/i },
  { label: "shining stars", re: /\bShining\s+Stars\b/i },
];

/**
 * @param {string} title
 * @returns {string | null}
 */
function detectNamedInsert(title) {
  for (const i of NAMED_INSERTS) if (i.re.test(title)) return i.label;
  return null;
}

/**
 * Couleurs/parallèles SAFE — celles dont l'apparition dans un titre eBay
 * indique clairement une variante de couleur (vs un mot ambigu comme "gold medal").
 * On les ajoute à la query 130point pour différencier les parallèles.
 */
const PARALLEL_TAGS = [
  { label: "outburst", re: /\bOutburst\b/i },
  { label: "dazzlers", re: /\bDazzlers\b/i },
  { label: "printing plate", re: /\bPrinting\s*Plate\b/i },
  { label: "high gloss", re: /\bHigh\s*Gloss\b/i },
  { label: "rainbow foil", re: /\bRainbow\s+Foil\b/i },
  { label: "exclusives", re: /\bExclusives\b/i },
  { label: "clear cut", re: /\bClear[\s-]?Cut\b|\bAcetate\b/i },
];

/**
 * @param {string} title
 * @returns {string | null}
 */
function detectParallelTag(title) {
  for (const p of PARALLEL_TAGS) if (p.re.test(title)) return p.label;
  return null;
}

/**
 * Couleur de parallèle. On ne capte QUE si le mot apparaît dans un contexte
 * de parallèle clair (à côté d'un "/N" tirage limité ou d'un tag connu) pour
 * éviter les faux positifs ("gold medal", "silver age").
 * @param {string} title
 * @returns {string | null}
 */
function detectParallelColor(title) {
  const colorWord = title.match(/\b(Gold|Silver|Bronze|Copper|Ruby|Sapphire|Emerald|Amethyst|Onyx|Platinum|Pink|Orange|Purple|Green|Blue|Red)\b/i);
  if (!colorWord) return null;
  // Contexte de parallèle : présence d'un tirage limité OU d'un tag connu OU d'un grade
  const hasParallelContext =
    /\/\d{1,4}\b/.test(title) ||
    /\b(Outburst|Dazzlers|Rainbow|Clear[\s-]?Cut|Acetate|Foil|Parallel|Spectrum|Holo)\b/i.test(title) ||
    /\b(PSA|BGS|SGC)\b/i.test(title);
  if (!hasParallelContext) return null;
  return colorWord[1].toLowerCase();
}

/**
 * Nom de famille normalisé depuis un nom complet connu ("Ivan Demidov" →
 * "demidov"). Sert de repli quand le titre eBay ne permet pas d'extraire le
 * nom (ex. joueur placé APRÈS le set : "2025-26 Dazzlers ... Demidov").
 * @param {string | null | undefined} knownName
 * @returns {string | null}
 */
function normalizeKnownLastName(knownName) {
  if (!knownName || typeof knownName !== "string") return null;
  const last = knownName.toLowerCase().trim().split(/\s+/).pop() ?? "";
  return last.length >= 2 ? last : null;
}

/**
 * @param {string | null | undefined} title
 * @param {string | null} [knownLastName] - nom (complet ou de famille) connu du
 *   contexte appelant (ex. Deal Finder cherche PAR joueur). Utilisé UNIQUEMENT
 *   en repli quand le titre ne livre pas de nom — les titres eBay placent
 *   souvent le joueur après le set, ce qui faisait échouer l'empreinte.
 * @returns {{ fingerprint: string; cardCode: string | null; cardType: string; printRun: string | null; grade: string | null; year: string | null; lastName: string | null; searchQuery: string } | null}
 */
export function extractCardFingerprint(title, knownLastName = null) {
  if (!title || typeof title !== "string") return null;
  const t = title.trim();
  if (!t) return null;

  const type = detectCardType(t);
  if (!type) {
    return null;
  }

  const lastName = detectPlayerLastName(t) || normalizeKnownLastName(knownLastName);
  const year = detectYear(t);
  if (!lastName || !year) return null;

  const grade = detectGrade(t);
  const cardCode = detectCardCode(t, type.cardType);
  const printRun = detectPrintRun(t);
  const setName = detectSetName(t);
  const namedInsert = detectNamedInsert(t);
  const parallelTag = detectParallelTag(t);
  const parallelColor = detectParallelColor(t);
  const modifier = detectSearchModifier(t);

  // Fingerprint : on inclut toutes les dimensions qui rendent une carte UNIQUE.
  // Ordre : nom-année-type-set-insert-parallèle-couleur-grade-code-tirage.
  // Deux annonces avec le même fingerprint = même carte physique.
  const fingerprintParts = [
    lastName,
    year,
    type.cardType,
    setName?.replace(/\s+/g, "-"),
    namedInsert?.replace(/\s+/g, "-"),
    parallelTag?.replace(/\s+/g, "-"),
    parallelColor,
    grade?.fingerprintPart,
    cardCode?.toLowerCase(),
    printRun,
  ].filter(Boolean);
  const fingerprint = fingerprintParts.join("-");

  // Query 130point : tokens lisibles séparés par espaces. On déduplique pour
  // éviter "premier premier" si le type matché est déjà "premier".
  const queryTokensRaw = [
    lastName,
    year,
    grade?.queryPart,
    setName,
    type.label,
    namedInsert,
    parallelTag,
    parallelColor,
    modifier,
    cardCode?.toLowerCase() ?? printRun,
  ].filter(Boolean);
  const seen = new Set();
  const queryParts = [];
  for (const tok of queryTokensRaw) {
    const k = String(tok).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    queryParts.push(tok);
  }

  return {
    fingerprint,
    cardCode,
    cardType: type.cardType,
    setName,
    namedInsert,
    parallelTag,
    parallelColor,
    printRun,
    grade: grade?.grade ?? null,
    year,
    lastName,
    searchQuery: queryParts.join(" "),
  };
}

/**
 * Traits partiels d'un titre, SANS exiger nom+année (contrairement à
 * extractCardFingerprint qui retourne null dès que l'un des deux manque —
 * très fréquent : les titres eBay commencent souvent par l'année, ce qui
 * vide le nom). Permet de rejeter les mismatches durs (grade, parallèle,
 * tirage, #carte) même sur un titre trop bruité pour un fingerprint complet.
 * @param {string | null | undefined} title
 * @returns {{ grade: string | null; cardCode: string | null; printRun: string | null; parallelTag: string | null; parallelColor: string | null; namedInsert: string | null } | null}
 */
export function extractPartialFeatures(title) {
  if (!title || typeof title !== "string") return null;
  const t = title.trim();
  if (!t) return null;
  const grade = detectGrade(t);
  return {
    grade: grade?.grade ?? null,
    cardCode: detectCardCode(t, null),
    printRun: detectPrintRun(t),
    parallelTag: detectParallelTag(t),
    parallelColor: detectParallelColor(t),
    namedInsert: detectNamedInsert(t),
  };
}

/**
 * @deprecated Use extractCardFingerprint.
 * @param {string | null | undefined} title
 */
export function extractCardNumber(title) {
  const fp = extractCardFingerprint(title);
  if (!fp?.cardCode) return null;
  return { cardNumber: fp.cardCode, searchQuery: fp.searchQuery };
}
