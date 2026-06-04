import Link from "next/link";

import "./app-nav.css";

/**
 * @param {{ active?: "deals" | "opportunites" | "analyse" | null }} props
 */
export default function AppNav({ active = null }) {
  return (
    <nav className="cs-nav" aria-label="Navigation principale">
      <Link href="/" className="cs-nav__logo">
        Card <span>Scout</span>
      </Link>
      <div className="cs-nav__actions">
        <Link
          href="/deals"
          className={`cs-nav__btn${active === "deals" ? " cs-nav__btn--active" : ""}`}
        >
          Marché des Cartes
        </Link>
        <Link
          href="/opportunites"
          className={`cs-nav__btn${active === "opportunites" ? " cs-nav__btn--active" : ""}`}
        >
          Opportunités Joueurs
        </Link>
        <Link
          href="/analyse"
          className={`cs-nav__btn${active === "analyse" ? " cs-nav__btn--active" : ""}`}
        >
          Analyser une annonce
        </Link>
      </div>
    </nav>
  );
}
