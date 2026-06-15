import Link from "next/link";
import "./footer.css";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="cs-footer">
      <div className="cs-footer__inner">
        <div className="cs-footer__brand">
          <p className="cs-footer__logo">Card <span>Scout</span></p>
          <p className="cs-footer__tagline">Intelligence pour cartes NHL</p>
          <p className="cs-footer__copy">© {year} Card Scout. Tous droits réservés.</p>
        </div>

        <div className="cs-footer__col">
          <p className="cs-footer__col-title">Explorer</p>
          <nav className="cs-footer__links" aria-label="Navigation principale footer">
            <Link href="/" className="cs-footer__link">Accueil</Link>
            <Link href="/deals" className="cs-footer__link">Deal Finder</Link>
            <Link href="/opportunites" className="cs-footer__link">Opportunités</Link>
            <Link href="/pulse" className="cs-footer__link">Pulse</Link>
            <Link href="/picks" className="cs-footer__link">Picks hebdo</Link>
            <Link href="/encheres" className="cs-footer__link">Enchères</Link>
            <Link href="/digest" className="cs-footer__link">Digest quotidien</Link>
          </nav>
        </div>

        <div className="cs-footer__col">
          <p className="cs-footer__col-title">Mon Compte</p>
          <nav className="cs-footer__links" aria-label="Navigation compte footer">
            <Link href="/portfolio" className="cs-footer__link">Mon Vault</Link>
            <Link href="/watchlist" className="cs-footer__link">Watchlist</Link>
            <Link href="/alertes" className="cs-footer__link">Alertes</Link>
            <Link href="/analyse" className="cs-footer__link">Analyser</Link>
            <Link href="/grading" className="cs-footer__link">Grading</Link>
          </nav>
        </div>
      </div>

      <div className="cs-footer__bottom">
        <p className="cs-footer__disclaimer">
          Les prix affichés proviennent d&apos;eBay via l&apos;API officielle. Card Scout n&apos;est pas affilié à eBay, NHL ou NHLPA.
        </p>
      </div>
    </footer>
  );
}
