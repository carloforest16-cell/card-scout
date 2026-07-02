"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu,
  Target,
  LayoutGrid,
  Search,
  Sparkles,
  TrendingUp,
  Gavel,
  Mail,
  User,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";

import "./home-feature-tabs.css";

/* ─── Mockup helpers (cartes visuelles à droite) ───────────────────────────── */

function MockScoreCard({ score = 8.4, name = "Connor Bedard", verdict = "ACHETER", verdictTone = "buy" }) {
  return (
    <div className="hft-mock hft-mock--score">
      <div className="hft-mock__head">
        <span className="hft-mock__eyebrow">CARD METRICS SCORE</span>
        <span className="hft-mock__player">{name}</span>
      </div>
      <div className="hft-mock__big-score">
        <span className="hft-mock__score-num">{score.toFixed(1)}</span>
        <span className="hft-mock__score-max">/10</span>
      </div>
      <div className="hft-mock__bar">
        <div className="hft-mock__bar-fill" style={{ width: `${score * 10}%` }} />
      </div>
      <div className="hft-mock__factors">
        {[
          { label: "Performance", val: 92 },
          { label: "Momentum", val: 85 },
          { label: "Hype", val: 78 },
          { label: "Marché", val: 70 },
        ].map((f) => (
          <div key={f.label} className="hft-mock__factor">
            <span className="hft-mock__factor-label">{f.label}</span>
            <div className="hft-mock__factor-bar">
              <div className="hft-mock__factor-fill" style={{ width: `${f.val}%` }} />
            </div>
            <span className="hft-mock__factor-val">{f.val}</span>
          </div>
        ))}
      </div>
      <div className={`hft-mock__verdict hft-mock__verdict--${verdictTone}`}>
        {verdict}
      </div>
    </div>
  );
}

function MockListingCard() {
  return (
    <div className="hft-mock hft-mock--listing">
      <div className="hft-mock__listing-head">
        <span className="hft-mock__pill hft-mock__pill--ebay">eBay · 2025-01 Young Guns</span>
        <span className="hft-mock__pill hft-mock__pill--success">−18% vs marché</span>
      </div>
      <div className="hft-mock__listing-title">Connor Bedard #451 — Upper Deck Young Guns</div>
      <div className="hft-mock__price-row">
        <div>
          <div className="hft-mock__price-label">Prix demandé</div>
          <div className="hft-mock__price">$42 CAD</div>
        </div>
        <div>
          <div className="hft-mock__price-label">Valeur marché</div>
          <div className="hft-mock__price hft-mock__price--muted">$51 CAD</div>
        </div>
      </div>
      <div className="hft-mock__scores-row">
        <div className="hft-mock__score-chip">
          <span className="hft-mock__score-chip-label">Annonce</span>
          <span className="hft-mock__score-chip-val">8.2</span>
        </div>
        <div className="hft-mock__score-chip">
          <span className="hft-mock__score-chip-label">Joueur</span>
          <span className="hft-mock__score-chip-val">8.4</span>
        </div>
        <div className="hft-mock__score-chip">
          <span className="hft-mock__score-chip-label">Prix</span>
          <span className="hft-mock__score-chip-val hft-mock__score-chip-val--good">9.0</span>
        </div>
      </div>
      <div className="hft-mock__verdict hft-mock__verdict--buy">ACHETER · Sous-évalué</div>
    </div>
  );
}

function MockAccountCard() {
  return (
    <div className="hft-mock hft-mock--account">
      <div className="hft-mock__head">
        <span className="hft-mock__eyebrow">MON DASHBOARD</span>
        <span className="hft-mock__player">Vue d&apos;ensemble</span>
      </div>
      <div className="hft-mock__kpi-grid">
        <div className="hft-mock__kpi">
          <div className="hft-mock__kpi-label">Valeur Vault</div>
          <div className="hft-mock__kpi-val">$1,847</div>
          <div className="hft-mock__kpi-delta hft-mock__kpi-delta--up">+12% ↗</div>
        </div>
        <div className="hft-mock__kpi">
          <div className="hft-mock__kpi-label">Cartes suivies</div>
          <div className="hft-mock__kpi-val">23</div>
          <div className="hft-mock__kpi-delta">14 joueurs</div>
        </div>
      </div>
      <div className="hft-mock__alerts">
        <div className="hft-mock__alert">
          <span className="hft-mock__alert-dot" />
          McDavid Auto −22% sous ton seuil
        </div>
        <div className="hft-mock__alert">
          <span className="hft-mock__alert-dot hft-mock__alert-dot--gold" />
          Pick hebdo prêt — 3 cartes
        </div>
      </div>
    </div>
  );
}

function MockAuctionCard() {
  return (
    <div className="hft-mock hft-mock--listing">
      <div className="hft-mock__listing-head">
        <span className="hft-mock__pill hft-mock__pill--ebay">ENCHÈRE eBay</span>
        <span className="hft-mock__pill hft-mock__pill--hot">2h 14min</span>
      </div>
      <div className="hft-mock__listing-title">Macklin Celebrini RC Auto /99</div>
      <div className="hft-mock__price-row">
        <div>
          <div className="hft-mock__price-label">Mise actuelle</div>
          <div className="hft-mock__price">$135 CAD</div>
        </div>
        <div>
          <div className="hft-mock__price-label">Valeur estimée</div>
          <div className="hft-mock__price hft-mock__price--muted">$210 CAD</div>
        </div>
      </div>
      <div className="hft-mock__scores-row">
        <div className="hft-mock__score-chip hft-mock__score-chip--lg">
          <span className="hft-mock__score-chip-label">Score Enchère</span>
          <span className="hft-mock__score-chip-val hft-mock__score-chip-val--good">9.1</span>
        </div>
      </div>
      <div className="hft-mock__verdict hft-mock__verdict--buy">URGENCE · Sous-évalué</div>
    </div>
  );
}

function MockMissionCard() {
  const decisions = [
    { name: "McDavid YG Auto", verdict: "ACHETER", tone: "buy" },
    { name: "Crosby Black Diamond", verdict: "SURVEILLER", tone: "watch" },
    { name: "Lafrenière Canvas", verdict: "PASSER", tone: "pass" },
  ];
  return (
    <div className="hft-mock hft-mock--mission">
      <div className="hft-mock__head">
        <span className="hft-mock__eyebrow">VERDICTS DE L&apos;IA</span>
        <span className="hft-mock__player">3 cartes, 3 décisions</span>
      </div>
      <div className="hft-mock__decisions">
        {decisions.map((d) => (
          <div key={d.name} className="hft-mock__decision">
            <div className="hft-mock__decision-name">{d.name}</div>
            <div className={`hft-mock__decision-verdict hft-mock__decision-verdict--${d.tone}`}>
              {d.verdict}
            </div>
          </div>
        ))}
      </div>
      <div className="hft-mock__mission-footer">
        Plus de scroll inutile sur eBay.<br />
        L&apos;IA décide à ta place.
      </div>
    </div>
  );
}

function MockDifferentiationCard() {
  const rows = [
    { label: "Sites d'annonces", cm: false, them: true, themText: "Affichent les prix" },
    { label: "Services de grading", cm: false, them: true, themText: "Notent l'état" },
    { label: "Brokers / dealers", cm: false, them: true, themText: "Vendent les cartes" },
    { label: "Card Metrics", cm: true, them: false, themText: "Analyse + verdict IA" },
  ];
  return (
    <div className="hft-mock hft-mock--diff">
      <div className="hft-mock__head">
        <span className="hft-mock__eyebrow">CARD METRICS VS LES AUTRES</span>
        <span className="hft-mock__player">Une couche d&apos;intelligence</span>
      </div>
      <div className="hft-mock__diff-rows">
        {rows.map((r) => (
          <div key={r.label} className={`hft-mock__diff-row${r.cm ? " hft-mock__diff-row--us" : ""}`}>
            <div className="hft-mock__diff-label">{r.label}</div>
            <div className="hft-mock__diff-text">{r.themText}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockFeatureCard({ icon: Icon, title, lines }) {
  return (
    <div className="hft-mock hft-mock--feature">
      <div className="hft-mock__feature-icon"><Icon size={20} /></div>
      <div className="hft-mock__feature-title">{title}</div>
      <div className="hft-mock__feature-lines">
        {lines.map((l) => (
          <div key={l} className="hft-mock__feature-line">
            <CheckCircle2 size={14} className="hft-mock__feature-check" />
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Typewriter step title ──────────────────────────────────────────────── */

function useTypewriter(text, active, { speed = 20, enabled = true } = {}) {
  const [output, setOutput] = useState(active && enabled ? "" : text);

  useEffect(() => {
    if (!active || !enabled) {
      setOutput(text);
      return;
    }
    setOutput("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setOutput(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, active, enabled, speed]);

  return output;
}

function StepTitle({ text, active, reducedMotion }) {
  const typed = useTypewriter(text, active, { enabled: !reducedMotion });
  const done = typed.length >= text.length;
  return (
    <>
      {typed}
      {active && !done && <span className="hft-caret" aria-hidden="true" />}
    </>
  );
}

/* ─── Tab data ─────────────────────────────────────────────────────────────── */

const TABS = [
  {
    value: "how",
    label: "Comment ça marche",
    icon: Cpu,
    items: [
      {
        id: "what-is",
        title: "Notre mission",
        body: "Card Metrics est un analyste de marché propulsé par l'IA, dédié aux cartes de hockey NHL. Au lieu d'acheter à l'instinct ou de scroller eBay pendant des heures, tu reçois une lecture claire du marché en temps réel et un verdict pour chaque carte : Acheter, Surveiller ou Passer. Investir intelligemment, sans avoir à devenir analyste toi-même.",
        cta: { href: "/deals", label: "Voir le Deal Finder" },
        mock: <MockMissionCard />,
      },
      {
        id: "for-who",
        title: "Pour qui c'est fait",
        body: "Pour le collectionneur qui veut acheter sans se faire avoir. Pour l'investisseur qui cherche des cartes sous-évaluées avant que le marché ne s'ajuste. Pour le parent qui veut offrir une carte sans tomber dans un piège. Si tu dépenses de l'argent sur des cartes NHL, Card Metrics te donne le bon angle d'attaque.",
        cta: { href: "/opportunites", label: "Voir les opportunités" },
        mock: <MockFeatureCard icon={User} title="Audience cible" lines={["Collectionneurs avertis", "Investisseurs en cartes NHL", "Parents & acheteurs occasionnels"]} />,
      },
      {
        id: "differentiation",
        title: "Ce qui nous démarque",
        body: "Card Metrics n'est ni un site d'annonces, ni un service de grading, ni un broker. C'est une couche d'intelligence par-dessus le marché : on agrège les annonces, les ventes récentes, les stats NHL et les signaux de hype, et on transforme tout ça en décisions concrètes. Une seule note de 0 à 10, un seul verdict, en quelques secondes.",
        cta: { href: "/analyse", label: "Tester l'analyse" },
        mock: <MockDifferentiationCard />,
      },
      {
        id: "compte-perso",
        title: "Va plus loin avec un compte",
        body: "Tout fonctionne sans inscription. Si tu veux suivre tes achats, créer une watchlist, recevoir des alertes prix ou les picks hebdo de l'IA, un compte gratuit (15 sec) débloque tout ça. Aucune donnée vendue, aucune carte de crédit demandée.",
        cta: { href: "/auth/login", label: "Créer un compte" },
        mock: <MockAccountCard />,
      },
    ],
  },
  {
    value: "score",
    label: "Le Card Metrics Score",
    icon: Target,
    items: [
      {
        id: "score-player",
        title: "Score Joueur",
        body: "Une note unique de 0 à 10 pour chaque joueur NHL. Le modèle combine les performances sur la glace, le momentum récent, le profil de marché, la hype et plus de dix autres signaux pour produire une lecture instantanée — pas besoin d'éplucher les stats toi-même.",
        cta: { href: "/pulse", label: "Voir le classement" },
        mock: <MockScoreCard />,
      },
      {
        id: "score-listing",
        title: "Score Annonce",
        body: "Évalue chaque annonce eBay en croisant trois éléments : la qualité du joueur, l'écart entre le prix demandé et la valeur du marché, et la rareté de la carte (rookie, numéroté, auto, état). Le résultat : un verdict clair Acheter / Surveiller / Passer, sans ambiguïté.",
        cta: { href: "/analyse", label: "Analyser une annonce" },
        mock: <MockListingCard />,
      },
      {
        id: "score-auction",
        title: "Score Enchères",
        body: "Un score d'opportunité dynamique pour les enchères live : urgence du timer, rabais par rapport à la valeur estimée, qualité de la carte, dynamique des mises. Idéal pour repérer les snipes intéressants sans surveiller eBay toute la journée.",
        cta: { href: "/encheres", label: "Voir les enchères" },
        mock: <MockAuctionCard />,
      },
    ],
  },
  {
    value: "features",
    label: "Les fonctionnalités",
    icon: LayoutGrid,
    items: [
      {
        id: "analyse",
        title: "Analyse d'annonces eBay",
        body: "Colle un lien d'annonce eBay et reçois en 5 secondes un verdict complet : prix juste ou sous-évalué, score du joueur, score de la carte. L'outil parfait quand tu hésites sur un achat précis.",
        cta: { href: "/analyse", label: "Analyser une annonce" },
        mock: <MockListingCard />,
      },
      {
        id: "deal-finder",
        title: "Deal Finder",
        body: "Cherche n'importe quel joueur NHL et vois toutes ses cartes en vente sur eBay — scorées, groupées (Young Guns, Auto, Canvas, Graded…), avec verdict IA sur chacune.",
        cta: { href: "/deals", label: "Ouvrir Deal Finder" },
        mock: <MockFeatureCard icon={Search} title="Deal Finder" lines={["Recherche par joueur", "Groupes Young Guns / Auto / Graded", "Score IA par annonce"]} />,
      },
      {
        id: "opportunites",
        title: "Opportunités",
        body: "Top 10 des cartes sous-évaluées du marché, rafraîchies deux fois par mois. Chaque opportunité vient avec une thèse d'investissement écrite par l'IA — pourquoi maintenant, à quel prix, jusqu'à quand.",
        cta: { href: "/opportunites", label: "Voir le top 10" },
        mock: <MockFeatureCard icon={Target} title="Top 10 Opportunités" lines={["Refresh 1er & 15 de chaque mois", "Thèse écrite par IA", "Horizon de détention indiqué"]} />,
      },
      {
        id: "pulse",
        title: "Pulse",
        body: "Le pouls du marché en temps réel : tendances joueurs, trades, contrats, blessures, mouvements de prix. Vue rapide pour repérer les catalyseurs avant que le marché ne réagisse.",
        cta: { href: "/pulse", label: "Ouvrir Pulse" },
        mock: <MockFeatureCard icon={TrendingUp} title="Pulse marché" lines={["Trades & contrats temps réel", "Blessures + suspensions", "Top movers de la semaine"]} />,
      },
      {
        id: "encheres",
        title: "Enchères",
        body: "Toutes les enchères eBay live des joueurs NHL, triées par score d'urgence. Tu vois en un coup d'œil les snipes intéressants — rabais + qualité carte + temps restant.",
        cta: { href: "/encheres", label: "Voir les enchères" },
        mock: <MockFeatureCard icon={Gavel} title="Enchères live" lines={["Score Enchère 0-10", "Filtrage par urgence", "Compte à rebours par lot"]} />,
      },
      {
        id: "picks",
        title: "Picks hebdo",
        body: "Tous les lundis matin, l'IA sélectionne 3-5 cartes à surveiller pour la semaine. Reçu par email, archivé dans ton compte.",
        cta: { href: "/picks", label: "Voir les picks" },
        mock: <MockFeatureCard icon={Mail} title="Picks de la semaine" lines={["3-5 cartes scorées par l'IA", "Reçu chaque lundi", "Historique consultable"]} />,
      },
      {
        id: "compte",
        title: "Mon compte",
        body: "Dashboard personnel avec ton Vault (valeur estimée en temps réel), watchlist de joueurs, alertes prix et paramètres. Tout est gratuit, sans publicité.",
        cta: { href: "/dashboard", label: "Mon dashboard" },
        mock: <MockAccountCard />,
      },
    ],
  },
];

/* ─── Main component ───────────────────────────────────────────────────────── */

export default function HomeFeatureTabs() {
  const [activeTab, setActiveTab] = useState(TABS[0].value);
  const [activeItemIdByTab, setActiveItemIdByTab] = useState(() =>
    Object.fromEntries(TABS.map((t) => [t.value, t.items[0].id]))
  );
  const [reducedMotion, setReducedMotion] = useState(false);

  const tab = TABS.find((t) => t.value === activeTab) ?? TABS[0];
  const activeItemId = activeItemIdByTab[activeTab];
  const activeItem = tab.items.find((i) => i.id === activeItemId) ?? tab.items[0];

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function selectTab(tabValue) {
    setActiveTab(tabValue);
    const nextTab = TABS.find((t) => t.value === tabValue);
    setActiveItemIdByTab((prev) => ({ ...prev, [tabValue]: nextTab.items[0].id }));
  }

  function selectItem(itemId) {
    setActiveItemIdByTab((prev) => ({ ...prev, [activeTab]: itemId }));
  }

  return (
    <section className="hft-section" aria-labelledby="hft-heading">
      <div className="hft-shell">
        <header className="hft-head">
          <p className="cn-eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            CARD METRICS · COMMENT ÇA FONCTIONNE
          </p>
          <h2 id="hft-heading" className="hft-heading">
            Tout ce que tu dois savoir,<br />
            <span className="hft-heading__ice">en trois clics.</span>
          </h2>
          <p className="hft-sub">
            Le fonctionnement, le score, et les outils — pour décider plus vite et mieux acheter.
          </p>
        </header>

        {/* Tabs */}
        <div className="hft-tabs" role="tablist" aria-label="Sections principales">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.value === activeTab;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`hft-panel-${t.value}`}
                className={`hft-tab${active ? " hft-tab--active" : ""}`}
                onClick={() => selectTab(t.value)}
              >
                {active && !reducedMotion && (
                  <motion.span
                    layoutId="hft-tab-glow"
                    className="hft-tab__glow"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    aria-hidden
                  />
                )}
                <Icon size={16} className="hft-tab__icon" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Panel — un seul texte visible à la fois, aligné avec le mockup */}
        <div
          id={`hft-panel-${activeTab}`}
          role="tabpanel"
          className="hft-panel"
        >
          {/* Nav étapes — ligne pleine largeur, hors de la zone centrée avec le mockup */}
          <div className="hft-steps-nav" role="tablist" aria-label="Étapes">
            {tab.items.map((item, i) => {
              const isActive = item.id === activeItemId;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`hft-steps-nav__btn${isActive ? " hft-steps-nav__btn--active" : ""}`}
                  onClick={() => selectItem(item.id)}
                >
                  <span className="hft-steps-nav__num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="hft-steps-nav__label">{item.title}</span>
                </button>
              );
            })}
          </div>

          <div className="hft-copy-col">
            {/* CSS animation (pas framer) : garantie de tourner à chaque
                remount, key change → toujours visible, jamais bloqué à
                opacity 0. */}
            <div key={activeItem.id} className="hft-active-step">
              <h3 className="hft-active-step__title">
                <StepTitle text={activeItem.title} active reducedMotion={reducedMotion} />
              </h3>
              <p className="hft-active-step__body">{activeItem.body}</p>
              {activeItem.cta && (
                <Link href={activeItem.cta.href} className="hft-acc-cta">
                  {activeItem.cta.label}
                  <ArrowUpRight size={14} />
                </Link>
              )}
              <div className="hft-step-mock-mobile">{activeItem.mock}</div>
            </div>
          </div>

          {/* Visual column — centrée au même niveau que le texte actif. Frames
              overlap et crossfade (pas de trou entre exit/enter). */}
          <div className="hft-visual-col">
            <div className="hft-visual">
              <AnimatePresence initial={false}>
                <motion.div
                  key={`${activeTab}-${activeItemId}`}
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reducedMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.2, 0.9, 0.3, 1] }}
                  className="hft-visual__inner"
                >
                  {activeItem.mock}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
