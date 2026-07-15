"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  Wrench,
  TrendingUp,
  User,
  Store,
  Gavel,
  Target,
  ScanLine,
  Activity,
  Mail,
  LayoutDashboard,
  BarChart2,
  Bookmark,
  Bell,
  Settings,
  Users,
  X,
} from "lucide-react";
import "./bottom-nav.css";
import PrefsToggle from "./PrefsToggle";

const SHEETS = {
  outils: {
    title: "Mes outils",
    items: [
      { href: "/deals",   label: "Deal Finder",       hint: "Cherche un joueur · cartes scorées", Icon: Store },
      { href: "/analyse", label: "Analyse d'annonce", hint: "Colle un lien eBay · verdict 5 sec", Icon: ScanLine },
    ],
  },
  marche: {
    title: "Le marché",
    items: [
      { href: "/opportunites", label: "Opportunités", hint: "Top 10 cartes sous-évaluées",        Icon: Target },
      { href: "/encheres",     label: "Enchères",     hint: "Enchères eBay live triées urgence", Icon: Gavel },
      { href: "/pulse",        label: "Pulse",        hint: "Trades · blessures · mouvements",   Icon: Activity },
      { href: "/picks",        label: "Picks hebdo",  hint: "Sélections IA du lundi",            Icon: Mail },
      { href: "/joueurs",     label: "Joueurs NHL",  hint: "Annuaire complet — browse & score",  Icon: Users },
    ],
  },
  profil: {
    title: "Mon profil",
    items: [
      { href: "/dashboard",     label: "Dashboard",  hint: "Vue d'ensemble",                Icon: LayoutDashboard },
      { href: "/portfolio",     label: "Vault",      hint: "Ton portfolio · suivi valeur",  Icon: BarChart2 },
      { href: "/watchlist",     label: "Watchlist",  hint: "Joueurs suivis",                Icon: Bookmark },
      { href: "/notifications", label: "Alertes",    hint: "Notifications & alertes prix",  Icon: Bell },
      { href: "/parametres",    label: "Paramètres", hint: "Préférences & compte",          Icon: Settings },
    ],
  },
};

const TABS = [
  { key: "home",   label: "Accueil",    Icon: Home,        href: "/" },
  { key: "outils", label: "Mes outils", Icon: Wrench,      sheet: "outils" },
  { key: "marche", label: "Le marché",  Icon: TrendingUp,  sheet: "marche" },
  { key: "profil", label: "Profil",     Icon: User,        sheet: "profil" },
];

function isActive(pathname, tab) {
  if (tab.href) return pathname === tab.href;
  const sheet = SHEETS[tab.sheet];
  return sheet?.items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}

export default function BottomNav() {
  const pathname = usePathname();
  const [openSheet, setOpenSheet] = useState(null); // "explorer" | "analyser" | "profil" | null

  // Close sheet on route change
  useEffect(() => { setOpenSheet(null); }, [pathname]);

  // Escape to close
  useEffect(() => {
    if (!openSheet) return;
    function onKey(e) { if (e.key === "Escape") setOpenSheet(null); }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openSheet]);

  const sheet = openSheet ? SHEETS[openSheet] : null;

  return (
    <>
      <nav className="bn-dock" aria-label="Navigation mobile">
        <div className="bn-dock__pill">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab);
            const { Icon } = tab;
            const isOpenSheet = openSheet === tab.sheet;
            const showLabel = active || isOpenSheet;

            const inner = (
              <>
                <Icon className="bn-dock__icon" size={20} strokeWidth={showLabel ? 2.3 : 1.9} />
                <span className={`bn-dock__label${showLabel ? " bn-dock__label--show" : ""}`}>
                  {tab.label}
                </span>
              </>
            );

            const className = `bn-dock__tab${showLabel ? " bn-dock__tab--active" : ""}`;

            if (tab.href) {
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={className}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpenSheet(null)}
                >
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={tab.key}
                type="button"
                className={className}
                onClick={() => setOpenSheet((s) => (s === tab.sheet ? null : tab.sheet))}
                aria-expanded={isOpenSheet}
                aria-controls={`bn-sheet-${tab.sheet}`}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </nav>

      {openSheet && (
        <div className="bn-sheet-backdrop" onClick={() => setOpenSheet(null)} aria-hidden>
          <div
            id={`bn-sheet-${openSheet}`}
            className="bn-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={sheet?.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bn-sheet__handle" aria-hidden />
            <div className="bn-sheet__head">
              <h2 className="bn-sheet__title">{sheet.title}</h2>
              <button
                type="button"
                className="bn-sheet__close"
                onClick={() => setOpenSheet(null)}
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="bn-sheet__list">
              {sheet.items.map(({ href, label, hint, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`bn-sheet__item${active ? " bn-sheet__item--active" : ""}`}
                    >
                      <span className="bn-sheet__item-icon">
                        <Icon size={18} strokeWidth={1.8} />
                      </span>
                      <span className="bn-sheet__item-body">
                        <span className="bn-sheet__item-label">{label}</span>
                        <span className="bn-sheet__item-hint">{hint}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {openSheet === "profil" && (
              <div className="bn-sheet__prefs">
                <div className="bn-sheet__prefs-row">
                  <span className="bn-sheet__prefs-label">Marché</span>
                  <PrefsToggle className="pt-wrap--sheet" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
