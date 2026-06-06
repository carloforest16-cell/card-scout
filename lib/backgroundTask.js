import "server-only";

import { waitUntil } from "@vercel/functions";

/**
 * Lance une tâche en arrière-plan sans bloquer la réponse HTTP.
 * Sur Vercel, utilise `waitUntil` pour que le rebuild survive à la fin de la requête.
 * En local, simple fire-and-forget.
 *
 * @param {() => Promise<unknown>} fn
 */
export function runInBackground(fn) {
  const task = Promise.resolve()
    .then(fn)
    .catch((err) => {
      console.error(
        "[backgroundTask]",
        err instanceof Error ? err.message : err
      );
    });

  if (typeof process.env.VERCEL === "string") {
    waitUntil(task);
  }
}
