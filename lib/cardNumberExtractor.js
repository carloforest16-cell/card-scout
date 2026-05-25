const CARD_TYPE_RULES = [
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
 * @param {string} title
 */
function detectCardType(title) {
  const hit = CARD_TYPE_RULES.find((rule) => rule.re.test(title));
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
  const m = title.match(
    /\/(?:5000|3000|2000|1000|999|500|499|250|200|150|100|99|75|50|25|15|10|5|3|1)\b/i
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
 * @param {string | null | undefined} title
 * @returns {{ fingerprint: string; cardCode: string | null; cardType: string; printRun: string | null; grade: string | null; year: string | null; lastName: string | null; searchQuery: string } | null}
 */
export function extractCardFingerprint(title) {
  if (!title || typeof title !== "string") return null;
  const t = title.trim();
  if (!t) return null;

  const type = detectCardType(t);
  if (!type) {
    console.log("[fingerprint] NO TYPE for:", t.slice(0, 60));
    return null;
  }

  const lastName = detectPlayerLastName(t);
  const year = detectYear(t);
  if (!lastName || !year) return null;

  const grade = detectGrade(t);
  const cardCode = detectCardCode(t, type.cardType);
  const printRun = detectPrintRun(t);

  const base = `${lastName}-${year}-${type.cardType}`;
  let fingerprint;
  if (cardCode) {
    fingerprint = `${base}-${cardCode}`;
  } else if (printRun) {
    fingerprint = `${base}-${printRun}`;
  } else {
    fingerprint = base;
  }

  const modifier = detectSearchModifier(t);
  const queryParts = [
    lastName,
    year,
    grade?.queryPart,
    type.label,
    modifier,
    cardCode?.toLowerCase() ?? printRun,
  ].filter(Boolean);

  console.log("[fingerprint]", {
    title: t.slice(0, 60),
    year,
    lastName,
    cardType: type?.cardType,
    cardCode,
    printRun,
    fingerprint,
  });

  return {
    fingerprint,
    cardCode,
    cardType: type.cardType,
    printRun,
    grade: grade?.grade ?? null,
    year,
    lastName,
    searchQuery: queryParts.join(" "),
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
