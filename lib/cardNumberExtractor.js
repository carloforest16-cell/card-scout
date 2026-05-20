const CARD_TYPE_RULES = [
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
  { type: "clear-cut", label: "clear cut", re: /\bClear\s*Cut\b|\bAcetate\b/i },
  { type: "exclusives", label: "exclusives", re: /\bExclusives\b/i },
  { type: "retro", label: "retro", re: /\bRetro\b/i },
  { type: "dazzlers", label: "dazzlers", re: /\bDazzlers\b/i },
  { type: "outburst", label: "outburst", re: /\bOutburst\b/i },
];

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
 * @param {string | null} cardType
 */
function detectCardCode(title, cardType) {
  const alphaCode =
    title.match(/\b([A-Z]{1,5}-\d{1,4})\b/i) ??
    title.match(/\b([A-Z]{1,5}\d{1,4})\b/i);
  if (alphaCode) return alphaCode[1].toUpperCase();

  const hashAlpha = title.match(/#\s*([A-Z]+\d{1,4}|[A-Z]+-\d{1,4})\b/i);
  if (hashAlpha) return hashAlpha[1].toUpperCase();

  const numeric = title.match(/#\s*(\d{3,4})\b/i);
  if (numeric && cardType) return numeric[1];

  return null;
}

/**
 * @param {string} title
 */
function detectPrintRun(title) {
  const m = title.match(/\/(?:999|499|250|99|50|25|10|5|1)\b/i);
  return m ? m[0] : null;
}

/**
 * @param {string} title
 */
function detectLastName(title) {
  const leading = title.match(/^\s*([A-Z][A-Za-z'.-]+)(?:\s+([A-Z][A-Za-z'.-]+))?/);
  return (leading?.[2] ?? leading?.[1] ?? "").toLowerCase();
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
 * @returns {{ fingerprint: string; cardCode: string | null; cardType: string; printRun: string | null; grade: string | null; searchQuery: string } | null}
 */
export function extractCardFingerprint(title) {
  if (!title || typeof title !== "string") return null;
  const t = title.trim();
  if (!t) return null;

  const type = detectCardType(t);
  if (!type) return null;

  const grade = detectGrade(t);
  const cardCode = detectCardCode(t, type.cardType);
  const printRun = detectPrintRun(t);

  let fingerprint;
  if (grade && cardCode) {
    fingerprint = `${grade.fingerprintPart}-${type.cardType}-${cardCode}`;
  } else if (cardCode) {
    fingerprint = `${type.cardType}-${cardCode}`;
  } else if (printRun) {
    fingerprint = `${type.cardType}-${printRun}`;
  } else {
    fingerprint = type.cardType;
  }

  const modifier = detectSearchModifier(t);
  const queryParts = [
    detectLastName(t),
    grade?.queryPart,
    type.label,
    modifier,
    cardCode?.toLowerCase() ?? printRun,
  ].filter(Boolean);

  return {
    fingerprint,
    cardCode,
    cardType: type.cardType,
    printRun,
    grade: grade?.grade ?? null,
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
