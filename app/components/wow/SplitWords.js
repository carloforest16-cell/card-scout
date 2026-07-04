"use client";

import { motion, useReducedMotion } from "framer-motion";

const HW_EASE = [0.22, 1, 0.36, 1];

/**
 * Titre dont les mots montent en masque (effet "split words"), extrait de
 * HomeCinematic.js (tâche 4.1 du plan) pour être réutilisable ailleurs que
 * la home. Respecte `prefers-reduced-motion` (texte statique si activé).
 * @param {{ text: string; delay?: number; step?: number }} props
 */
export default function SplitWords({ text, delay = 0, step = 0.09 }) {
  const reduced = useReducedMotion();
  const words = text.split(" ");
  return (
    <span aria-label={text} role="text">
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="hw-split__mask" aria-hidden>
          {reduced ? (
            <span className="hw-split__word">{w}</span>
          ) : (
            <motion.span
              className="hw-split__word"
              initial={{ y: "118%", rotate: 3 }}
              animate={{ y: "0%", rotate: 0 }}
              transition={{ duration: 0.9, delay: delay + i * step, ease: HW_EASE }}
            >
              {w}
            </motion.span>
          )}
        </span>
      ))}
    </span>
  );
}
