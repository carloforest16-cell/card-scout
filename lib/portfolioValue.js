import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

const CACHE_FRESHNESS_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Calcule la valeur marché actuelle d'un portfolio utilisateur en croisant
 * portfolio_cards × card_price_history (match par player_name + card_type +
 * grade). Si la table d'historique ne contient pas de point récent, on
 * laisse currentValue à null (le client affichera "—" et un état "en
 * cours de constitution").
 *
 * À enrichir plus tard avec un fallback eBay live par carte.
 */
export async function computePortfolioValue(userId) {
  const supabase = getSupabaseAdmin();

  const { data: cards, error: cardsErr } = await supabase
    .from("portfolio_cards")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (cardsErr) throw cardsErr;
  if (!cards || cards.length === 0) {
    return { cards: [], totalCurrent: 0, totalCost: 0, pnl: 0, pnlPct: 0 };
  }

  // Fetch the most recent price snapshot for each (player_name, card_type, grade) combo
  const keys = new Set(
    cards.map((c) =>
      buildKey(c.player_name, c.card_type, c.grade)
    )
  );

  const enriched = await Promise.all(
    cards.map(async (card) => {
      const snap = await fetchLatestSnapshot(
        supabase,
        card.player_name,
        card.card_type,
        card.grade
      );
      const purchase = Number(card.purchase_price_cad) || 0;
      const current = snap?.median_price_cad ? Number(snap.median_price_cad) : null;
      const pnl = current != null ? Number((current - purchase).toFixed(2)) : null;
      const pnlPct = current != null && purchase > 0
        ? Number(((current - purchase) / purchase * 100).toFixed(1))
        : null;
      const isFresh = snap?.snapshot_date
        ? Date.now() - new Date(snap.snapshot_date).getTime() < CACHE_FRESHNESS_MS * 4
        : false;
      return {
        ...card,
        currentValueCad: current,
        pnl,
        pnlPct,
        priceSource: snap ? "card_price_history" : null,
        priceSnapshotDate: snap?.snapshot_date ?? null,
        priceFresh: isFresh,
      };
    })
  );

  const totalCost = enriched.reduce(
    (s, c) => s + (Number(c.purchase_price_cad) || 0),
    0
  );
  const totalCurrent = enriched.reduce(
    (s, c) => s + (c.currentValueCad ?? Number(c.purchase_price_cad) ?? 0),
    0
  );
  const pnl = Number((totalCurrent - totalCost).toFixed(2));
  const pnlPct = totalCost > 0 ? Number((pnl / totalCost * 100).toFixed(1)) : 0;

  const matchedCount = enriched.filter((c) => c.currentValueCad != null).length;

  return {
    cards: enriched,
    totalCurrent: Number(totalCurrent.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    pnl,
    pnlPct,
    matchedCount,
    uniqueKeysCount: keys.size,
  };
}

function buildKey(player, type, grade) {
  return [normalize(player), normalize(type), normalize(grade)].join("|");
}
function normalize(s) {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * Calcule un Portfolio Health Score (0-100) à partir des cartes d'un utilisateur.
 *
 * Composantes :
 *  - Score moyen : moyenne des Card Metrics Scores des cartes du portfolio
 *  - Diversification : nombre de joueurs/positions uniques
 *  - Tendance : % de cartes dont le score monte vs descend (sur 14j)
 *  - Concentration : pénalité si >40% de la valeur sur un seul joueur
 *
 * Suggère aussi des swaps : remplacer une carte score < 5 par un top du DB.
 *
 * @param {string} userId
 * @returns {Promise<{ healthScore: number; breakdown: object; swapSuggestions: Array<object>; portfolio: object }>}
 */
export async function computePortfolioHealthScore(userId) {
  const supabase = getSupabaseAdmin();

  // 1. Récupère le portfolio + valeurs (réutilise computePortfolioValue)
  const portfolio = await computePortfolioValue(userId);
  const cards = Array.isArray(portfolio?.cards) ? portfolio.cards : [];

  if (cards.length === 0) {
    return {
      healthScore: null,
      breakdown: null,
      swapSuggestions: [],
      portfolio,
    };
  }

  // 2. Récupère les Card Metrics Scores pour chaque joueur du portfolio
  const playerIds = [...new Set(cards.map((c) => String(c.player_id)).filter(Boolean))];
  const { data: scoreRows } = await supabase
    .from("player_scores")
    .select("player_id, player_name, score, tier, data")
    .in("player_id", playerIds);
  const scoreMap = new Map();
  (scoreRows ?? []).forEach((row) => scoreMap.set(String(row.player_id), row));

  // 3. Récupère l'historique des scores pour calculer la tendance (14 jours)
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceStr = since.toISOString().slice(0, 10);
  const { data: historyRows } = await supabase
    .from("player_scores_history")
    .select("player_id, snapshot_date, score")
    .in("player_id", playerIds)
    .gte("snapshot_date", sinceStr)
    .order("snapshot_date", { ascending: true });

  // Map: player_id → earliest score in window
  const earliestScoreMap = new Map();
  for (const row of historyRows ?? []) {
    const id = String(row.player_id);
    if (!earliestScoreMap.has(id)) earliestScoreMap.set(id, Number(row.score));
  }

  // 4. Calcule les composantes
  let scoreSum = 0;
  let scoreCount = 0;
  const playerSet = new Set();
  const positionSet = new Set();
  const ageBuckets = new Set();
  let risingCount = 0;
  let fallingCount = 0;
  const valueByPlayer = new Map();
  let totalValue = 0;
  const declineCards = [];

  for (const card of cards) {
    const id = String(card.player_id);
    playerSet.add(id);
    const scoreRow = scoreMap.get(id);
    const currentScore = Number(scoreRow?.score);
    if (Number.isFinite(currentScore)) {
      scoreSum += currentScore;
      scoreCount += 1;
    }
    const position = scoreRow?.data?.position ?? scoreRow?.data?.payload?.position;
    if (position) positionSet.add(String(position).toUpperCase());

    const age = Number(scoreRow?.data?.payload?.ageYears ?? scoreRow?.data?.ageYears);
    if (Number.isFinite(age)) {
      if (age <= 23) ageBuckets.add("jeune");
      else if (age <= 28) ageBuckets.add("prime");
      else if (age <= 32) ageBuckets.add("veteran");
      else ageBuckets.add("late");
    }

    // Tendance
    const earliest = earliestScoreMap.get(id);
    if (Number.isFinite(currentScore) && Number.isFinite(earliest)) {
      const delta = currentScore - earliest;
      if (delta >= 0.3) risingCount += 1;
      else if (delta <= -0.3) fallingCount += 1;
    }

    // Concentration (valeur par joueur)
    const value = Number(card.currentValueCad ?? card.purchase_price_cad ?? 0);
    if (Number.isFinite(value) && value > 0) {
      totalValue += value;
      valueByPlayer.set(id, (valueByPlayer.get(id) ?? 0) + value);
    }

    // Cartes en déclin (à proposer en swap)
    if (Number.isFinite(currentScore) && currentScore < 5) {
      declineCards.push({
        cardId: card.id,
        playerId: id,
        playerName: card.player_name,
        cardType: card.card_type,
        currentScore,
        valueCad: value,
      });
    }
  }

  const avgScore = scoreCount > 0 ? scoreSum / scoreCount : 0;
  const uniquePlayers = playerSet.size;
  const uniquePositions = positionSet.size;
  const uniqueAgeBuckets = ageBuckets.size;

  // Concentration max sur un joueur (% du total)
  let maxConcentration = 0;
  for (const v of valueByPlayer.values()) {
    if (totalValue > 0) {
      const pct = v / totalValue;
      if (pct > maxConcentration) maxConcentration = pct;
    }
  }

  // 5. Health score 0-100
  // 50 points sur score moyen (échelle 0-10 → 0-50)
  // 15 points sur diversification (3 positions, 3 ageBuckets, 5+ players)
  // 20 points sur tendance (% rising parmi cartes scorées)
  // 15 points pénalité concentration (>40% = -15)
  let healthScore = 0;
  healthScore += Math.min(50, avgScore * 5);

  let diversityPts = 0;
  if (uniquePositions >= 3) diversityPts += 5;
  else if (uniquePositions >= 2) diversityPts += 3;
  if (uniqueAgeBuckets >= 3) diversityPts += 5;
  else if (uniqueAgeBuckets >= 2) diversityPts += 3;
  if (uniquePlayers >= 5) diversityPts += 5;
  else if (uniquePlayers >= 3) diversityPts += 3;
  healthScore += diversityPts;

  const movingCards = risingCount + fallingCount;
  if (movingCards > 0) {
    const risingPct = risingCount / movingCards;
    healthScore += Math.round(risingPct * 20);
  } else {
    healthScore += 10; // pas de signal → neutre 10/20
  }

  // Concentration : pleine note 15 pts si <30%, dégressif jusqu'à 0 à 60%
  if (maxConcentration < 0.3) healthScore += 15;
  else if (maxConcentration < 0.4) healthScore += 10;
  else if (maxConcentration < 0.5) healthScore += 5;
  else if (maxConcentration < 0.6) healthScore += 2;
  // sinon 0

  healthScore = Math.round(Math.min(100, Math.max(0, healthScore)));

  // 6. Suggestions de swap : pour chaque carte score<5 en déclin,
  //    propose la meilleure alternative (top score pas dans le portfolio)
  const swapSuggestions = [];
  if (declineCards.length > 0) {
    const { data: topRows } = await supabase
      .from("player_scores")
      .select("player_id, player_name, score, tier, team, headshot_url")
      .order("score", { ascending: false })
      .limit(20);

    const portfolioIds = new Set(playerIds);
    const candidates = (topRows ?? []).filter((r) => !portfolioIds.has(String(r.player_id)));

    // Match positionnel si possible (sinon top tout court)
    for (const card of declineCards.slice(0, 3)) {
      const cardScoreRow = scoreMap.get(card.playerId);
      const cardPosition = String(
        cardScoreRow?.data?.position ?? cardScoreRow?.data?.payload?.position ?? ""
      ).toUpperCase();

      let pick = null;
      if (cardPosition) {
        // Note : on n'a pas filtré candidates par position (data field n'est pas
        // facilement queryable côté DB). Match best-effort via le top global.
        pick = candidates[0] ?? null;
      } else {
        pick = candidates[0] ?? null;
      }
      if (!pick) continue;

      swapSuggestions.push({
        from: {
          cardId: card.cardId,
          playerId: card.playerId,
          playerName: card.playerName,
          cardType: card.cardType,
          currentScore: Math.round(card.currentScore * 10) / 10,
        },
        to: {
          playerId: String(pick.player_id),
          playerName: pick.player_name,
          score: Number(pick.score),
          tier: pick.tier,
          team: pick.team,
          headshotUrl: pick.headshot_url,
        },
        rationale: `Score actuel ${card.currentScore.toFixed(1)} → upgrade vers ${pick.player_name} (${Number(pick.score).toFixed(1)})`,
      });

      // Évite de proposer le même remplaçant deux fois
      const idx = candidates.findIndex((c) => String(c.player_id) === String(pick.player_id));
      if (idx !== -1) candidates.splice(idx, 1);
    }
  }

  return {
    healthScore,
    breakdown: {
      avgScore: Math.round(avgScore * 10) / 10,
      uniquePlayers,
      uniquePositions,
      uniqueAgeBuckets,
      risingCount,
      fallingCount,
      neutralCount: scoreCount - risingCount - fallingCount,
      maxConcentrationPct: Math.round(maxConcentration * 1000) / 10,
      cardsScored: scoreCount,
      totalCards: cards.length,
    },
    swapSuggestions,
    portfolio,
  };
}

async function fetchLatestSnapshot(supabase, playerName, cardType, grade) {
  if (!playerName) return null;
  const query = supabase
    .from("card_price_history")
    .select("median_price_cad, snapshot_date")
    .ilike("player_name", String(playerName).trim())
    .order("snapshot_date", { ascending: false })
    .limit(1);
  if (cardType) query.ilike("card_type", String(cardType).trim());
  if (grade) query.ilike("grade", String(grade).trim());
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data;
}
