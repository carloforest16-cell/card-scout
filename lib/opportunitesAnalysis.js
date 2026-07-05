import "server-only";

import {
  ageYearsFromBirthDate,
  buildScorePayloadFromLanding,
  NHL_LEAGUE_AVG_PPG,
} from "@/lib/cardScoutScore";
import { getDeepseekApiKey } from "@/lib/deepseekKey";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";
import {
  formatSeasonLabel,
  resolveFullName,
  resolveHeadshotUrl,
  resolveTeamLabel,
} from "@/lib/nhlPlayerLanding";
import { getUnderdogPlayers } from "@/lib/underdogFinder";
import { TRENDING_PLAYER_IDS } from "@/lib/trendingData";

const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const TOP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PLAYER_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const TOP_OPPORTUNITIES_COUNT = 8;
const TOP_ANALYZE_CONCURRENCY = 4;

/** @type {{ fetchedAt: number; payload: object | null }} */
let topCache = { fetchedAt: 0, payload: null };

/** @type {Map<string, { fetchedAt: number; data: object }>} */
const playerAnalysisCache = new Map();

const SYSTEM_PROMPT = `Tu es un expert en investissement de cartes de sport NHL avec 20 ans d'expérience. Tu combines l'analyse de performance sportive, la psychologie du marché des collectibles, et l'intelligence financière pour identifier les meilleures opportunités d'investissement dans les cartes NHL.

Tu dois analyser chaque joueur de façon exhaustive et donner un verdict d'investissement précis et actionnable.

Réponds UNIQUEMENT en JSON valide.`;

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
  return " - ";
}

/**
 * @param {ReturnType<typeof buildScorePayloadFromLanding>} payload
 */
function formatSeasonHistoryBlock(payload) {
  const lines = [];
  const cs = payload.currentSeason;
  if (cs?.seasonLabel) {
    lines.push(
      `- ${cs.seasonLabel} : ${cs.gamesPlayed ?? " - "} MJ, ${cs.goals ?? " - "} B, ${cs.assists ?? " - "} A, ${cs.points ?? " - "} pts (${cs.pointsPerGame ?? " - "} pts/match)`
    );
  }
  for (const s of payload.lastSeasons ?? []) {
    if (!s?.seasonLabel) continue;
    lines.push(
      `- ${s.seasonLabel} : ${s.gamesPlayed ?? " - "} MJ, ${s.goals ?? " - "} B, ${s.assists ?? " - "} A, ${s.points ?? " - "} pts (${s.pointsPerGame ?? " - "} pts/match)`
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
Ã‚GE : ${payload.ageYears ?? " - "} ans
ÉQUIPE : ${team}
POSITION : ${position}

STATS SAISON ACTUELLE (${seasonLabel}) :
- Matchs joués : ${cs?.gamesPlayed ?? " - "}
- Buts : ${cs?.goals ?? " - "}
- Passes : ${cs?.assists ?? " - "}
- Points : ${cs?.points ?? " - "}
- Points par match : ${cs?.pointsPerGame ?? " - "}
- Moyenne NHL : ${NHL_LEAGUE_AVG_PPG} pts/match

HISTORIQUE DES SAISONS :
${formatSeasonHistoryBlock(payload)}

Analyse les facteurs suivants et donne un score JSON :
{
  "investmentScore": (0-10, précis Ã  0.1),
  "playerAnalysis": {
    "ageScore": (0-10),
    "ageComment": (une phrase),
    "performanceScore": (0-10),
    "performanceComment": (une phrase),
    "trajectoryScore": (0-10),
    "trajectoryComment": (une phrase - monte/stagne/décline),
    "franchiseScore": (0-10),
    "franchiseComment": (une phrase - est-il le visage de la franchise?),
    "contractScore": (0-10),
    "contractComment": (une phrase - FA bientôt? Extension récente?),
    "marketScore": (0-10),
    "marketComment": (une phrase - popularité, nationalité, fan base)
  },
  "cardRecommendations": [
    {
      "cardType": (ex: Young Guns Rookie),
      "priority": (Priorité haute/moyenne/faible),
      "reasoning": (2 phrases pourquoi cette carte),
      "expectedTimeline": (ex: 2-3 saisons),
      "expectedUpside": (ex: +40-60%),
      "searchTerms": (ex: caufield young guns 2021)
    }
  ],
  "risks": [une phrase sur les risques principaux],
  "verdict": (Acheter maintenant / Surveiller / Éviter),
  "verdictReasoning": (2-3 phrases d'analyse finale en français, mentionne des comparaisons avec d'autres joueurs similaires si pertinent, sois spécifique et actionnable)
}

Sois précis, spécifique, et pense comme un investisseur professionnel qui mise son propre argent.`;
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
    priority: String(r?.priority ?? "Priorité moyenne").trim(),
    reasoning: String(r?.reasoning ?? "").trim(),
    expectedTimeline: String(r?.expectedTimeline ?? "2-3 saisons").trim(),
    expectedUpside: String(r?.expectedUpside ?? " - ").trim(),
    searchTerms: String(r?.searchTerms ?? ctx.playerName).trim(),
  }));

  let risks = raw?.risks;
  if (Array.isArray(risks)) {
    risks = risks.map((x) => String(x).trim()).filter(Boolean);
  } else if (typeof risks === "string" && risks.trim()) {
    risks = [risks.trim()];
  } else {
    risks = ["Risque de blessure et volatilité du marché des cartes."];
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
      ageComment: String(pa.ageComment ?? " - ").trim(),
      performanceScore: clampFactor(pa.performanceScore),
      performanceComment: String(pa.performanceComment ?? " - ").trim(),
      trajectoryScore: clampFactor(pa.trajectoryScore),
      trajectoryComment: String(pa.trajectoryComment ?? " - ").trim(),
      franchiseScore: clampFactor(pa.franchiseScore),
      franchiseComment: String(pa.franchiseComment ?? " - ").trim(),
      contractScore: clampFactor(pa.contractScore),
      contractComment: String(pa.contractComment ?? " - ").trim(),
      marketScore: clampFactor(pa.marketScore),
      marketComment: String(pa.marketComment ?? " - ").trim(),
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
        ageComment: `${age} ans  -  fenêtre d'appréciation ${age <= 24 ? "longue" : "modérée"}.`,
        performanceScore: ppg >= 0.8 ? 8 : 6,
        performanceComment: `Production de ${ppg || " - "} pts/match vs moyenne ligue ${NHL_LEAGUE_AVG_PPG}.`,
        trajectoryScore: 7,
        trajectoryComment: "Trajectoire compatible avec un achat patient sur le marché des cartes.",
        franchiseScore: 7,
        franchiseComment: "Profil visible dans une organisation NHL établie.",
        contractScore: 6,
        contractComment: "Situation contractuelle Ã  surveiller selon l'actualité NHL.",
        marketScore: 7,
        marketComment: "Demande collecteurs soutenue pour les rookies et parallèles premium.",
      },
      cardRecommendations: [
        {
          cardType: "Young Guns Rookie",
          priority: "Priorité haute",
          reasoning: `La carte rookie flagship de ${name} reste le véhicule le plus liquide. Les comparables montrent une prime durable sur les YG en croissance de production.`,
          expectedTimeline: "2-3 saisons",
          expectedUpside: "+35-55%",
          searchTerms: `${name} young guns`,
        },
      ],
      risks: [
        "Blessure ou ralentissement de production peut compresser les prix Ã  court terme.",
      ],
      verdict: score >= 7.5 ? "Acheter maintenant" : "Surveiller",
      verdictReasoning: `${name} présente un profil d'investissement ${score >= 7.5 ? "convaincant" : "intéressant en surveillance"} pour un horizon 2-3 saisons. Prioriser une entrée sur Young Guns en raw, avec patience sur la liquidité.`,
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

  const apiKey = getDeepseekApiKey();
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
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 4000,
        temperature: 0.25,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });

    const rawText = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `DeepSeek ${res.status}`,
        detail: rawText.slice(0, 200),
        status: 502,
      };
    }

    const parsed = JSON.parse(rawText);
    const obj = extractJsonObject(parsed?.choices?.[0]?.message?.content ?? "");
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
    "Profil intéressant pour un horizon long terme.";

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
