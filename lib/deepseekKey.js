/**
 * Clé API DeepSeek pour tous les appels de scoring.
 * @returns {string}
 */
export function getDeepseekApiKey() {
  return process.env.DEEPSEEK_API_KEY?.trim() || "";
}
