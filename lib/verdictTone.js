/**
 * @param {string} verdict
 * @returns {"buy" | "watch" | "avoid" | "unknown"}
 */
export function verdictTone(verdict) {
  if (!verdict || typeof verdict !== "string") return "unknown";
  const v = verdict.trim().toLowerCase();
  if (v.includes("acheter")) return "buy";
  if (v.includes("surveiller")) return "watch";
  if (v.includes("éviter") || v.includes("eviter")) return "avoid";
  return "unknown";
}
