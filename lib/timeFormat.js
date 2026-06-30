/**
 * Formate une date en temps relatif en français.
 * ex: "il y a 2h", "il y a 3 jours", "il y a 5 min"
 *
 * @param {string|Date|null} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  if (!date) return "jamais";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "date invalide";

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "il y a quelques secondes";
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `il y a ${m} min`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `il y a ${h}h`;
  }
  if (diffSec < 86400 * 7) {
    const d = Math.floor(diffSec / 86400);
    return `il y a ${d} jour${d > 1 ? "s" : ""}`;
  }
  if (diffSec < 86400 * 30) {
    const w = Math.floor(diffSec / (86400 * 7));
    return `il y a ${w} semaine${w > 1 ? "s" : ""}`;
  }
  const mo = Math.floor(diffSec / (86400 * 30));
  return `il y a ${mo} mois`;
}

/**
 * Formate une durée en millisecondes vers une chaîne lisible.
 * ex: "1.2s", "450ms"
 *
 * @param {number|null} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
