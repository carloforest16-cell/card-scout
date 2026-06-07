/**
 * Clé API Anthropic pour tous les appels Claude.
 * Historiquement le code lit `CS_CLAUDE_KEY` (dev local), mais la variable
 * documentée / présente en prod est `ANTHROPIC_API_KEY`. On accepte les deux
 * pour éviter qu'un nommage diverge entre environnements.
 * @returns {string}
 */
export function getClaudeApiKey() {
  return (
    process.env.CS_CLAUDE_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    ""
  );
}
