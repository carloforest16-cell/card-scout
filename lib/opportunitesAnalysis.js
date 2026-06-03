import "server-only";

import {
  ageYearsFromBirthDate,
  buildScorePayloadFromLanding,
  NHL_LEAGUE_AVG_PPG,
} from "@/lib/cardScoutScore";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";
import {
  formatSeasonLabel,
  resolveFullName,
  resolveHeadshotUrl,
  resolveTeamLabel,
} from "@/lib/nhlPlayerLanding";
import { getUnderdogPlayers } from "@/lib/underdogFinder";
import { TRENDING_PLAYER_IDS } from "@/lib/trendingData";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const TOP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PLAYER_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const TOP_OPPORTUNITIES_COUNT = 8;
const TOP_ANALYZE_CONCURRENCY = 4;

/** @type {{ fetchedAt: number; payload: object | null }} */
let topCache = { fetchedAt: 0, payload: null };

/** @type {Map<string, { fetchedAt: number; data: object }>} */
const playerAnalysisCache = new Map();

const SYSTEM_PROMPT = `Tu es un expert en investissement de cartes de sport NHL avec 20 ans d'expÃ©rience. Tu combines l'analyse de performance sportive, la psychologie du marchÃ© des collectibles, et l'intelligence financiÃ¨re pour identifier les meilleures opportunitÃ©s d'investissement dans les cartes NHL.

Tu dois analyser chaque joueur de faÃ§on exhaustive et donner un verdict d'investissement prÃ©cis et actionnable.

RÃ©ponds UNIQUEMENT en JSON valide.`;

/**
 * @param {string} text
 * @returns {object | null}
 */
function extractJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {unknown} n
 */
function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 5;
  return Math.round(Math.min(10, Math.max(0, x)) * 10) / 10;
}

/**
 * @param {unknown} n
 */
function clampFactor(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 5;
  return Math.round(Math.min(10, Math.max(0, x)) * 10) / 10;
}

/**
 * @param {Record<string, unknown>} data
 */
function resolvePosition(data) {
  const p = data.position ?? data.primaryPosition;
  if (typeof p === "string" && p.trim()) return p.trim();
  if (p && typeof p === "object" && p.default) return String(p.default).trim();
  return "â€”";
}

/**
 * @param {ReturnType<typeof buildScorePayloadFromLanding>} payload
 */
function formatSeasonHistoryBlock(payload) {
  const lines = [];
  const cs = payload.currentSeason;
  if (cs?.seasonLabel) {
    lines.push(
      `- ${cs.seasonLabel} : ${cs.gamesPlayed ?? "â€”"} MJ, ${cs.goals ?? "â€”"} B, ${cs.assists ?? "â€”"} A, ${cs.points ?? "â€”"} pts (${cs.pointsPerGame ?? "â€”"} pts/match)`
    );
  }
  for (const s of payload.lastSeasons ?? []) {
    if (!s?.seasonLabel) continue;
    lines.push(
      `- ${s.seasonLabel} : ${s.gamesPlayed ?? "â€”"} MJ, ${s.goals ?? "â€”"} B, ${s.assists ?? "â€”"} A, ${s.points ?? "â€”"} pts (${s.pointsPerGame ?? "â€”"} pts/match)`
    );
  }
  return lines.length ? lines.join("\n") : "Historique non disponible";
}

/**
 * @param {ReturnType<typeof buildScorePayloadFromLanding>} payload
 * @param {string} team
 * @param {string} position
 */
function buildUserPrompt(payload, team, position) {
  const cs = payload.currentSeason;
  const seasonLabel = cs?.seasonLabel ?? "actuelle";
  return `Analyse ce joueur NHL pour l'investissement en cartes :

JOUEUR : ${payload.playerName}
Ã‚GE : ${payload.ageYears ?? "â€”"} ans
Ã‰QUIPE : ${team}
POSITION : ${position}

STATS SAISON ACTUELLE (${seasonLabel}) :
- Matchs jouÃ©s : ${cs?.gamesPlayed ?? "â€”"}
- Buts : ${cs?.goals ?? "â€”"}
- Passes : ${cs?.assists ?? "â€”"}
- Points : ${cs?.points ?? "â€”"}
- Points par match : ${cs?.pointsPerGame ?? "â€”"}
- Moyenne NHL : ${NHL_LEAGUE_AVG_PPG} pts/match

HISTORIQUE DES SAISONS :
${formatSeasonHistoryBlock(payload)}

Analyse les facteurs suivants et donne un score JSON :
{
  "investmentScore": (0-10, prÃ©cis Ã  0.1),
  "playerAnalysis": {
    "ageScore": (0-10),
    "ageComment": (une phrase),
    "performanceScore": (0-10),
    "performanceComment": (une phrase),
    "trajectoryScore": (0-10),
    "trajectoryComment": (une phrase - monte/stagne/dÃ©cline),
    "franchiseScore": (0-10),
    "franchiseComment": (une phrase - est-il le visage de la franchise?),
    "contractScore": (0-10),
    "contractComment": (une phrase - FA bientÃ´t? Extension rÃ©cente?),
    "marketScore": (0-10),
    "marketComment": (une phrase - popularitÃ©, nationalitÃ©, fan base)
  },
  "cardRecommendations": [
    {
      "cardType": (ex: Young Guns Rookie),
      "priority": (PrioritÃ© haute/moyenne/faible),
      "reasoning": (2 phrases pourquoi cette carte),
      "expectedTimeline": (ex: 2-3 saisons),
      "expectedUpside": (ex: +40-60%),
      "searchTerms": (ex: caufield young guns 2021)
    }
  ],
  "risks": [une phrase sur les risques principaux],
  "verdict": (Acheter maintenant / Surveiller / Ã‰viter),
  "verdictReasoning": (2-3 phrases d'analyse finale en franÃ§ais, mentionne des comparaisons avec d'autres joueurs similaires si pertinent, sois spÃ©cifique et actionnable)
}

Sois prÃ©cis, spÃ©cifique, et pense comme un investisseur professionnel qui mise son propre argent.`;
}

/**
 * @param {unknown} raw
 * @param {object} ctx
 */
function normalizeAnalysis(raw, ctx) {
  const pa = raw?.playerAnalysis && typeof raw.playerAnalysis === "object"
    ? raw.playerAnalysis
    : {};

  const recs = Array.isArray(raw?.cardRecommendations)
    ? raw.cardRecommendations
    : [];

  const cardRecommendations = recs.slice(0, 5).map((r) => ({
    cardType: String(r?.cardType ?? "Carte rookie").trim(),
    priority: String(r?.priority ?? "PrioritÃ© moyenne").trim(),
    reasoning: String(r?.reasoning ?? "").trim(),
    expectedTimeline: String(r?.expectedTimeline ?? "2-3 saisons").trim(),
    expectedUpside: String(r?.expectedUpside ?? "â€”").trim(),
    searchTerms: String(r?.searchTerms ?? ctx.playerName).trim(),
  }));

  let risks = raw?.risks;
  if (Array.isArray(risks)) {
    risks = risks.map((x) => String(x).trim()).filter(Boolean);
  } else if (typeof risks === "string" && risks.trim()) {
    risks = [risks.trim()];
  } else {
    risks = ["Risque de blessure et volatilitÃ© du marchÃ© des cartes."];
  }

  return {
    playerId: ctx.playerId,
    playerName: ctx.playerName,
    team: ctx.team,
    age: ctx.age,
    position: ctx.position,
    headshotUrl: ctx.headshotUrl,
    investmentScore: clampScore(raw?.investmentScore),
    playerAnalysis: {
      ageScore: clampFactor(pa.ageScore),
      ageComment: String(pa.ageComment ?? "â€”").trim(),
      performanceScore: clampFactor(pa.performanceScore),
      performanceComment: String(pa.performanceComment ?? "â€”").trim(),
      trajectoryScore: clampFactor(pa.trajectoryScore),
      trajectoryComment: String(pa.trajectoryComment ?? "â€”").trim(),
      franchiseScore: clampFactor(pa.franchiseScore),
      franchiseComment: String(pa.franchiseComment ?? "â€”").trim(),
      contractScore: clampFactor(pa.contractScore),
      contractComment: String(pa.contractComment ?? "â€”").trim(),
      marketScore: clampFactor(pa.marketScore),
      marketComment: String(pa.marketComment ?? "â€”").trim(),
    },
    cardRecommendations,
    risks,
    verdict: String(raw?.verdict ?? "Surveiller").trim(),
    verdictReasoning: String(
      raw?.verdictReasoning ?? "Analyse en cours de consolidation."
    ).trim(),
    mocked: Boolean(ctx.mocked),
  };
}

/**
 * @param {ReturnType<typeof buildScorePayloadFromLanding>} payload
 * @param {object} landing
 * @param {string} playerId
 */
function buildMockAnalysis(payload, landing, playerId) {
  const ppg = Number(payload.currentSeason?.pointsPerGame ?? 0);
  const age = payload.ageYears ?? 24;
  let score = 6.5;
  if (ppg >= 1) score = 8.2;
  else if (ppg >= 0.75) score = 7.4;
  else if (ppg >= 0.5) score = 6.8;
  if (age <= 23) score = Math.min(10, score + 0.4);

  const name = payload.playerName;
  return normalizeAnalysis(
    {
      investmentScore: score,
      playerAnalysis: {
        ageScore: age <= 25 ? 8 : 6,
        ageComment: `${age} ans â€” fenÃªtre d'apprÃ©ciation ${age <= 24 ? "longue" : "modÃ©rÃ©e"}.`,
        performanceScore: ppg >= 0.8 ? 8 : 6,
        performanceComment: `Production de ${ppg || "â€”"} pts/match vs moyenne ligue ${NHL_LEAGUE_AVG_PPG}.`,
        trajectoryScore: 7,
        trajectoryComment: "Trajectoire compatible avec un achat patient sur le marchÃ© des cartes.",
        franchiseScore: 7,
        franchiseComment: "Profil visible dans une organisation NHL Ã©tablie.",
        contractScore: 6,
        contractComment: "Situation contractuelle Ã  surveiller selon l'actualitÃ© NHL.",
        marketScore: 7,
        marketComment: "Demande collecteurs soutenue pour les rookies et parallÃ¨les premium.",
      },
      cardRecommendations: [
        {
          cardType: "Young Guns Rookie",
          priority: "PrioritÃ© haute",
          reasoning: `La carte rookie flagship de ${name} reste le vÃ©hicule le plus liquide. Les comparables montrent une prime durable sur les YG en croissance de production.`,
          expectedTimeline: "2-3 saisons",
          expectedUpside: "+35-55%",
          searchTerms: `${name} young guns`,
        },
      ],
      risks: [
        "Blessure ou ralentissement de production peut compresser les prix Ã  court terme.",
      ],
      verdict: score >= 7.5 ? "Acheter maintenant" : "Surveiller",
      verdictReasoning: `${name} prÃ©sente un profil d'investissement ${score >= 7.5 ? "convaincant" : "intÃ©ressant en surveillance"} pour un horizon 2-3 saisons. Prioriser une entrÃ©e sur Young Guns en raw, avec patience sur la liquiditÃ©.`,
    },
    {
      playerId: String(playerId),
      playerName: name,
      team: resolveTeamLabel(landing),
      age,
      position: resolvePosition(landing),
      headshotUrl: resolveHeadshotUrl(landing, playerId),
      mocked: true,
    }
  );
}

/**
 * @param {string} playerId
 * @param {string} [nameHint]
 */
export async function analyzePlayerInvestment(playerId, nameHint = "") {
  const id = String(playerId ?? "").trim();
  if (!id) {
    return { ok: false, error: "playerId requis", status: 400 };
  }

  const cacheKey = id;
  const cached = playerAnalysisCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PLAYER_CACHE_TTL_MS) {
    return { ok: true, data: cached.data };
  }

  const landing = await getPlayerLandingCached(id);
  if (!landing) {
    return { ok: false, error: "Joueur NHL introuvable", status: 404 };
  }

  const payload = buildScorePayloadFromLanding(id, landing);
  const ctx = {
    playerId: id,
    playerName: payload.playerName || nameHint || resolveFullName(landing),
    team: resolveTeamLabel(landing),
    age: payload.ageYears,
    position: resolvePosition(landing),
    headshotUrl: resolveHeadshotUrl(landing, id),
    mocked: false,
  };

  const apiKey = process.env.CS_CLAUDE_KEY;
  if (!apiKey) {
    const mock = buildMockAnalysis(payload, landing, id);
    playerAnalysisCache.set(cacheKey, {
      fetchedAt: Date.now(),
      data: mock,
    });
    return { ok: true, data: mock };
  }

  const userPrompt = buildUserPrompt(payload, ctx.team, ctx.position);

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2200,
        temperature: 0.25,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
      cache: "no-store",
    });

    const rawText = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `Anthropic ${res.status}`,
        detail: rawText.slice(0, 200),
        status: 502,
      };
    }

    const parsed = JSON.parse(rawText);
    const textBlock = parsed?.content?.find((b) => b?.type === "text");
    const obj = extractJsonObject(textBlock?.text ?? "");
    if (!obj) {
      const mock = buildMockAnalysis(payload, landing, id);
      mock.analysisFallback = true;
      playerAnalysisCache.set(cacheKey, {
        fetchedAt: Date.now(),
        data: mock,
      });
      return { ok: true, data: mock };
    }

    const data = normalizeAnalysis(obj, ctx);
    playerAnalysisCache.set(cacheKey, { fetchedAt: Date.now(), data });
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: "Analyse impossible",
      detail: String(err?.message ?? err),
      status: 502,
    };
  }
}

/**
 * @param {object} analysis
 */
export function analysisToTopCard(analysis) {
  const topRec = analysis.cardRecommendations?.[0];
  const reason =
    topRec?.reasoning?.split(/[.!?]/)[0]?.trim() ||
    analysis.verdictReasoning?.slice(0, 120) ||
    "Profil intÃ©ressant pour un horizon long terme.";

  return {
    playerId: analysis.playerId,
    playerName: analysis.playerName,
    team: analysis.team,
    age: analysis.age,
    headshotUrl: analysis.headshotUrl,
    investmentScore: analysis.investmentScore,
    holdTimeline: topRec?.expectedTimeline ?? "2-3 saisons",
    cardType: topRec?.cardType ?? "Young Guns",
    reason: reason.endsWith(".") ? reason : `${reason}.`,
    verdict: analysis.verdict,
    mocked: Boolean(analysis.mocked),
  };
}

/**
 * @param {Array<{ playerId: string | number; name?: string }>} candidates
 */
async function analyzeCandidatesBatch(candidates) {
  const results = [];
  for (let i = 0; i < candidates.length; i += TOP_ANALYZE_CONCURRENCY) {
    const chunk = candidates.slice(i, i + TOP_ANALYZE_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (c) => {
        const result = await analyzePlayerInvestment(
          String(c.playerId),
          c.name ?? ""
        );
        if (!result.ok) return null;
        return analysisToTopCard(result.data);
      })
    );
    results.push(...chunkResults.filter(Boolean));
  }
  return results;
}

/**
 * @returns {Promise<Array<{ playerId: string | number; name?: string }>>}
 */
async function collectTopCandidates() {
  /** @type {Map<string, { playerId: string; name?: string }>} */
  const map = new Map();

  for (const id of TRENDING_PLAYER_IDS) {
    map.set(String(id), { playerId: String(id) });
  }

  try {
    const underdogs = await getUnderdogPlayers();
    for (const u of underdogs) {
      map.set(String(u.playerId), {
        playerId: String(u.playerId),
        name: u.name,
      });
    }
  } catch {
    /* underdog optionnel */
  }

  return [...map.values()];
}

/**
 * @returns {Promise<{ ok: true; mocked: boolean; cards: object[]; analyzed: number } | { ok: false; error: string }>}
 */
export async function buildTopOpportunities() {
  const now = Date.now();
  if (topCache.payload && now - topCache.fetchedAt < TOP_CACHE_TTL_MS) {
    return topCache.payload;
  }

  const candidates = await collectTopCandidates();
  const cards = await analyzeCandidatesBatch(candidates);
  cards.sort((a, b) => Number(b.investmentScore) - Number(a.investmentScore));
  const top = cards.slice(0, TOP_OPPORTUNITIES_COUNT);
  const mocked = top.every((c) => c.mocked);

  const payload = {
    ok: true,
    mocked,
    cards: top,
    analyzed: candidates.length,
  };
  topCache = { fetchedAt: now, payload };
  return payload;
}
