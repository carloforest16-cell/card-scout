import "../cinematic.css";
import "./a-propos.css";

import Link from "next/link";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";

export const metadata = {
  title: "À propos — Card Scout",
  description: "Pourquoi Card Scout existe, ce que c'est, ce que ce n'est pas, et nos sources de données. Projet indépendant pour collectionneurs NHL.",
  openGraph: {
    title: "À propos — Card Scout",
    description: "Projet indépendant. Aucune affiliation avec eBay, NHL, ou NHLPA. Voici comment ça marche vraiment.",
  },
};

export default function AProposPage() {
  return (
    <div className="ap-page cinematic">
      <ScrollProgress />
      <Atmosphere />

      <div className="ap-rail">
        <div className="ap-rail__inner">
          <AppNav active={null} />
        </div>
      </div>

      <main className="ap-main">
        <Reveal as="header" className="ap-hero">
          <p className="cn-eyebrow ap-hero__eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            À PROPOS · TRANSPARENCE
          </p>
          <h1 className="cn-h1 ap-hero__title">
            Card Scout — <span className="cn-h1__ice">la version honnête</span>
          </h1>
          <p className="cn-body ap-hero__sub">
            Pas de bullshit, pas de promesses fumeuses. Voici ce que c&apos;est, ce que ce n&apos;est pas,
            d&apos;où viennent les données, et ce qu&apos;on construit ensuite.
          </p>
        </Reveal>

        <Reveal index={1}>
          <section className="ap-block">
            <h2 className="cn-h2 ap-block__title">Pourquoi Card Scout</h2>
            <p className="ap-block__text">
              Quand t&apos;achètes une carte de hockey sur eBay, t&apos;es seul devant 200 annonces.
              Difficile de savoir laquelle vaut son prix, laquelle est surévaluée, et laquelle est un vrai deal.
              Les outils existants soit demandent un abonnement premium, soit affichent des prix complètement
              déconnectés du marché canadien.
            </p>
            <p className="ap-block__text">
              Card Scout agrège les annonces eBay actives en temps réel, calcule une cote du marché à partir
              de cohortes de cartes comparables (même set, même année, même grade), et utilise l&apos;IA pour
              scorer chaque annonce sur 0–10. L&apos;objectif est simple : te donner la même info qu&apos;un dealer
              expérimenté, en 3 secondes.
            </p>
          </section>
        </Reveal>

        <Reveal index={2}>
          <section className="ap-block">
            <h2 className="cn-h2 ap-block__title">Ce que c&apos;est</h2>
            <ul className="ap-list">
              <li className="ap-list__item">
                <span className="ap-list__bullet ap-list__bullet--good">✓</span>
                <span>
                  <strong>Un agrégateur eBay</strong> avec filtres intelligents (reprints, lots et faux retirés)
                </span>
              </li>
              <li className="ap-list__item">
                <span className="ap-list__bullet ap-list__bullet--good">✓</span>
                <span>
                  <strong>Une cote du marché</strong> calculée par cohortes : même type de carte + même grade + même année
                </span>
              </li>
              <li className="ap-list__item">
                <span className="ap-list__bullet ap-list__bullet--good">✓</span>
                <span>
                  <strong>Un score IA</strong> qui combine performance du joueur, momentum, âge, marché, hype
                </span>
              </li>
              <li className="ap-list__item">
                <span className="ap-list__bullet ap-list__bullet--good">✓</span>
                <span>
                  <strong>Des alertes</strong> par email (watchlist, enchères chaudes, deals quotidiens)
                </span>
              </li>
              <li className="ap-list__item">
                <span className="ap-list__bullet ap-list__bullet--good">✓</span>
                <span>
                  <strong>Gratuit</strong>. Pas de paywall, pas d&apos;abonnement.
                </span>
              </li>
            </ul>
          </section>
        </Reveal>

        <Reveal index={3}>
          <section className="ap-block">
            <h2 className="cn-h2 ap-block__title">Ce que ce n&apos;est PAS</h2>
            <ul className="ap-list">
              <li className="ap-list__item">
                <span className="ap-list__bullet ap-list__bullet--bad">✗</span>
                <span>
                  <strong>Pas un broker.</strong> On n&apos;achète ni ne vend de cartes. On envoie vers eBay.
                </span>
              </li>
              <li className="ap-list__item">
                <span className="ap-list__bullet ap-list__bullet--bad">✗</span>
                <span>
                  <strong>Pas une garantie de rendement.</strong> Le marché des cartes est volatil. Un score 8/10
                  ne signifie pas que tu feras un profit.
                </span>
              </li>
              <li className="ap-list__item">
                <span className="ap-list__bullet ap-list__bullet--bad">✗</span>
                <span>
                  <strong>Pas une prédiction de prix.</strong> Les chiffres affichés sont basés sur les annonces
                  actives (prix demandés), pas sur des ventes réelles confirmées par eBay.
                </span>
              </li>
              <li className="ap-list__item">
                <span className="ap-list__bullet ap-list__bullet--bad">✗</span>
                <span>
                  <strong>Pas affilié à eBay, NHL ou NHLPA.</strong> Projet indépendant qui utilise des APIs
                  publiques officielles.
                </span>
              </li>
            </ul>
          </section>
        </Reveal>

        <Reveal index={4}>
          <section className="ap-block">
            <h2 className="cn-h2 ap-block__title">Sources de données</h2>
            <div className="ap-sources">
              <div className="ap-source">
                <p className="ap-source__name">eBay Browse API</p>
                <p className="ap-source__role">
                  Annonces actives (prix demandés). Endpoint officiel, accès via OAuth client_credentials.
                  Marketplace par défaut : eBay Canada.
                </p>
                <p className="ap-source__status ap-source__status--active">Actif</p>
              </div>
              <div className="ap-source">
                <p className="ap-source__name">NHL Stats API</p>
                <p className="ap-source__role">
                  Stats officielles des joueurs (performance, momentum, contexte d&apos;équipe).
                  Endpoints publics api-web.nhle.com et api.nhle.com/stats.
                </p>
                <p className="ap-source__status ap-source__status--active">Actif</p>
              </div>
              <div className="ap-source">
                <p className="ap-source__name">DeepSeek</p>
                <p className="ap-source__role">
                  Modèle deepseek-chat pour scorer chaque annonce, générer les verdicts, et expliquer les choix.
                </p>
                <p className="ap-source__status ap-source__status--active">Actif</p>
              </div>
              <div className="ap-source">
                <p className="ap-source__name">eBay Marketplace Insights (Sold Comps)</p>
                <p className="ap-source__role">
                  Ventes réelles confirmées. Requiert un accès élevé qu&apos;eBay accorde au cas par cas.
                  En attente depuis 2026 — l&apos;ancienne Finding API a été décommissionnée.
                </p>
                <p className="ap-source__status ap-source__status--pending">En attente d&apos;accès</p>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal index={5}>
          <section className="ap-block">
            <h2 className="cn-h2 ap-block__title">Roadmap publique</h2>
            <p className="ap-block__text ap-block__text--muted">
              Voici ce qu&apos;on construit en ce moment. Pas d&apos;engagements de dates, juste l&apos;ordre des priorités.
            </p>
            <ul className="ap-roadmap">
              <li className="ap-roadmap__item">
                <span className="ap-roadmap__status ap-roadmap__status--done">Fait</span>
                <span>Section enchères chaudes en temps réel</span>
              </li>
              <li className="ap-roadmap__item">
                <span className="ap-roadmap__status ap-roadmap__status--done">Fait</span>
                <span>Historique des prix sur 12 mois (mini-charts)</span>
              </li>
              <li className="ap-roadmap__item">
                <span className="ap-roadmap__status ap-roadmap__status--progress">En cours</span>
                <span>Digest quotidien par email (chaque matin à 8h)</span>
              </li>
              <li className="ap-roadmap__item">
                <span className="ap-roadmap__status ap-roadmap__status--next">À venir</span>
                <span>Cote basée sur ventes réelles (dès qu&apos;eBay accorde l&apos;accès)</span>
              </li>
              <li className="ap-roadmap__item">
                <span className="ap-roadmap__status ap-roadmap__status--next">À venir</span>
                <span>Notifications mobiles (Web Push)</span>
              </li>
              <li className="ap-roadmap__item">
                <span className="ap-roadmap__status ap-roadmap__status--next">À venir</span>
                <span>Module portefeuille avec calcul de plus-value</span>
              </li>
            </ul>
          </section>
        </Reveal>

        <Reveal index={6}>
          <section className="ap-block">
            <h2 className="cn-h2 ap-block__title">L&apos;équipe</h2>
            <p className="ap-block__text">
              Projet indépendant porté par un collectionneur passionné. Aucun investisseur, aucune commission
              cachée sur les transactions, aucun deal avec les vendeurs. Si tu cliques sur un lien eBay depuis
              Card Scout, on peut recevoir une petite commission d&apos;affiliation — ça finance les serveurs et
              les APIs, point.
            </p>
            <p className="ap-block__text">
              Une question ? Une bug ? Une idée ? Le projet vit grâce au feedback. Tu peux écrire directement
              via la page contact.
            </p>
          </section>
        </Reveal>

        <Reveal index={7}>
          <div className="ap-cta">
            <Link href="/" className="cn-btn cn-btn--ghost">
              Retour à l&apos;accueil →
            </Link>
          </div>
        </Reveal>
      </main>
    </div>
  );
}
