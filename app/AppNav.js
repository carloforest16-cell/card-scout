"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import {
  Search, Store, Target, ScanLine, Activity,
  Mail, Gavel, X, Menu,
  Sparkles, LayoutDashboard, Users, Trophy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AuthButton from "@/app/AuthButton";
import NotificationsBell from "@/app/components/NotificationsBell";
import PrefsToggle from "@/app/components/PrefsToggle";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

/* ── Menu structure ──────────────────────────────────────────────────────────
 * Nav à plat (pas de dropdown) : avec seulement 8 liens, cacher quoi que ce
 * soit derrière un clic ajoute de la friction sans bénéfice. Revu suite au
 * retour de Carlo (2026-07-04) — l'ancienne structure à 2 groupes ("Mes
 * outils" / "Le marché") cachait Backtest entièrement et forçait à ouvrir
 * 2 menus pour scanner le site. */
const NAV_ITEMS = [
  { href: "/deals",        label: "Deal Finder",  description: "Cherche un joueur · vois ses cartes scorées", icon: Store,    gradient: "from-[#ff1744] to-[#ff6d00]" },
  { href: "/analyse",      label: "Analyse",       description: "Colle un lien eBay · verdict en 5 sec",       icon: ScanLine, gradient: "from-[#aa00ff] to-[#7c4dff]" },
  { href: "/opportunites", label: "Opportunités",  description: "Top 10 cartes sous-évaluées",                 icon: Target,   gradient: "from-[#FFB800] to-[#ff6d00]" },
  { href: "/encheres",     label: "Enchères",      description: "Enchères eBay live triées urgence",           icon: Gavel,    gradient: "from-[#ef4444] to-[#f97316]" },
  { href: "/pulse",        label: "Pulse",         description: "Trades · blessures · mouvements",             icon: Activity, gradient: "from-[#f97316] to-[#ef4444]" },
  { href: "/picks",        label: "Picks",         description: "Sélections IA du lundi (newsletter)",         icon: Mail,     gradient: "from-[#a78bfa] to-[#7c3aed]" },
  { href: "/joueurs",     label: "Joueurs",       description: "Annuaire complet NHL — browse & compare",      icon: Users,    gradient: "from-[#0ea5e9] to-[#0070f3]" },
  { href: "/recrues",      label: "Recrues",       description: "La cuvée de l'année classée par score",       icon: Trophy,   gradient: "from-[#FFB800] to-[#f59e0b]" },
  // Backtest volontairement absent du nav (2026-07-04, retour Carlo) : la
  // page est vide ("collecte de données en cours") tant que /api/backtest
  // renvoie sampleSize < MIN_SAMPLE_SIZE (10, voir app/api/backtest/route.js)
  // pour toutes les fenêtres. Remettre le lien une fois qu'au moins une
  // fenêtre (1/3/6 mois) a un échantillon suffisant.
];

/* ── Recent search helpers ───────────────────────────────────────────────── */
const RECENT_KEY = "cs_recent_searches";
const MAX_RECENT = 5;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function saveRecent(player) {
  try {
    const entry = {
      id: player.playerId ?? player.id,
      name: player.name ?? player.fullName,
      headshotUrl: player.headshotUrl ?? null,
      team: player.team ?? player.teamName ?? player.currentTeamAbbrev ?? null,
    };
    const prev = loadRecent().filter((r) => String(r.id) !== String(entry.id));
    localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...prev].slice(0, MAX_RECENT)));
  } catch { /* safari private */ }
}

/* ── Nav link (desktop, à plat) ───────────────────────────────────────────── */
function NavLink({ item, pathname }) {
  const active = pathname === item.href || pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className={`
        relative flex items-center px-3 py-1.5 rounded-lg text-[13px] font-medium
        transition-all duration-200 select-none
        ${active ? "text-white" : "text-[#64748B] hover:text-white"}
      `}
    >
      {active && (
        <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#00D4FF]/10 to-[#0070f3]/10 border border-[#00D4FF]/20" />
      )}
      <span className="relative">{item.label}</span>
    </Link>
  );
}

/* ── Nav link (drawer mobile, à plat) ─────────────────────────────────────── */
function MobileNavLink({ item, pathname, onClose }) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={`
        flex items-center gap-3 rounded-xl px-3 py-2.5 mb-0.5 transition-all duration-150 border
        ${active
          ? "bg-[#00D4FF]/[0.08] border-[#00D4FF]/20 text-white"
          : "text-[#94A3B8] hover:text-white hover:bg-white/[0.04] border-transparent"
        }
      `}
    >
      <div className={`shrink-0 w-7 h-7 rounded-md bg-gradient-to-br ${item.gradient} flex items-center justify-center`}>
        <Icon size={13} className="text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{item.label}</div>
        <div className="text-[10px] text-[#475569] leading-snug">{item.description}</div>
      </div>
    </Link>
  );
}

/* ── Portal wrapper (renders children into document.body) ────────────────── */
function NavPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function AppNav({ active = null }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState([]);
  const [scrolled, setScrolled] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const router = useRouter();

  const [pathname, setPathname] = useState("/");
  const [isAuthed, setIsAuthed] = useState(false);
  useEffect(() => { setPathname(window.location.pathname); }, []);

  useEffect(() => {
    const supabase = createSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setIsAuthed(Boolean(data?.user)));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthed(Boolean(session?.user));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 12); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onResize() { if (window.innerWidth >= 1280) setDrawerOpen(false); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // Keyboard shortcut "/" to open search
  useEffect(() => {
    function onKey(e) {
      if (e.key === "/" && !searchOpen && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        openSearch();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  function openSearch() {
    setDrawerOpen(false);
    setRecent(loadRecent());
    setSearchOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }
  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    setResults([]);
  }

  async function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/player?q=${encodeURIComponent(q.trim())}`);
        const data = await r.json();
        const list = data?.results ?? data?.players ?? data ?? [];
        setResults(Array.isArray(list) ? list : []);
      } catch { setResults([]); }
      setLoading(false);
    }, 280);
  }

  function handleSelect(player) {
    saveRecent(player);
    closeSearch();
    router.push(`/player/${player.playerId ?? player.id}`);
  }
  function handleSelectRecent(entry) {
    closeSearch();
    router.push(`/player/${entry.id}`);
  }
  function clearRecent() {
    try { localStorage.removeItem(RECENT_KEY); } catch { /* */ }
    setRecent([]);
  }

  return (
    <>
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <nav
        aria-label="Navigation principale"
        className={`
          relative z-50 flex items-center justify-between h-14 lg:h-16 px-4 lg:px-8
          transition-all duration-500
        `}
        style={{
          background: scrolled
            ? "linear-gradient(180deg, rgba(5,6,10,0.95) 0%, rgba(5,6,10,0.85) 100%)"
            : "linear-gradient(180deg, rgba(5,6,10,0.7) 0%, rgba(5,6,10,0.3) 100%)",
          backdropFilter: "blur(20px) saturate(1.4)",
          borderBottom: scrolled
            ? "1px solid rgba(0,212,255,0.06)"
            : "1px solid rgba(255,255,255,0.03)",
          boxShadow: scrolled
            ? "0 4px 30px rgba(0,0,0,0.4), 0 0 60px rgba(0,212,255,0.02)"
            : "none",
        }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-blanc.svg"
            alt=""
            aria-hidden
            className="h-9 w-auto object-contain group-hover:scale-105 transition-transform duration-200"
          />
          <span
            style={{
              fontFamily: "var(--cn-display)",
              fontSize: "16px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              background: "linear-gradient(90deg, #00D4FF 0%, #7c4dff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            CardMetrics
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden xl:flex items-center gap-1">
          {/* Search trigger */}
          <button
            onClick={openSearch}
            className="flex items-center gap-2 pl-3 pr-2.5 py-[6px] mr-2 rounded-lg transition-all duration-200 group/search"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(0,212,255,0.2)";
              e.currentTarget.style.background = "rgba(0,212,255,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            }}
          >
            <Search size={13} className="text-[#475569] group-hover/search:text-[#00D4FF] transition-colors" />
            <span className="text-[12px] text-[#475569] group-hover/search:text-[#64748B] transition-colors w-[70px] text-left">
              Rechercher…
            </span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-[#475569] font-mono border border-white/[0.06]">
              /
            </kbd>
          </button>

          {/* Thin separator */}
          <div className="w-px h-4 bg-white/[0.06] mx-1" />

          {/* Dashboard pill — connecté seulement */}
          {isAuthed && (
            <Link
              href="/dashboard"
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 select-none ${
                pathname === "/dashboard" ? "text-white" : "text-[#64748B] hover:text-white"
              }`}
            >
              {pathname === "/dashboard" && (
                <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#00D4FF]/10 to-[#0070f3]/10 border border-[#00D4FF]/20" />
              )}
              <span className="relative flex items-center gap-1.5">
                <LayoutDashboard size={13} className="opacity-80" />
                Dashboard
              </span>
            </Link>
          )}

          {/* Liens à plat — tout visible, aucun dropdown à ouvrir */}
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Live indicator — desktop (2xl+ uniquement, libère de l'espace en 1280-1535px) */}
          <div className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full mr-2"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.12)" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            </span>
            <span className="text-[10px] text-emerald-400/80 font-medium tracking-wide uppercase">Live</span>
          </div>

          {/* Notifications bell — desktop */}
          <div className="hidden xl:flex items-center mr-1">
            <NotificationsBell />
          </div>

          {/* Lang toggle — desktop */}
          <div className="hidden xl:flex items-center">
            <PrefsToggle />
          </div>

          {/* Auth — desktop */}
          <div className="hidden xl:block">
            <AuthButton />
          </div>

          {/* Search icon — mobile/tablette */}
          <button
            onClick={openSearch}
            className="xl:hidden flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200"
            style={{
              background: "rgba(0,212,255,0.06)",
              border: "1px solid rgba(0,212,255,0.1)",
            }}
            aria-label="Rechercher"
          >
            <Search size={16} className="text-[#00D4FF]/70" />
          </button>

          {/* Hamburger — mobile/tablette */}
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="xl:hidden flex items-center justify-center w-11 h-11 rounded-xl text-[#94A3B8] hover:text-white transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            aria-label={drawerOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </nav>

      {/* ── Mobile drawer + search ──────────────────────────────────── */}
      <NavPortal>
      <div
        onClick={() => setDrawerOpen(false)}
        className={`
          fixed inset-0 z-40 xl:hidden
          transition-opacity duration-300
          ${drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
        aria-hidden
      />
      <div
        className={`
          fixed top-0 right-0 z-50 w-[82vw] max-w-xs xl:hidden
          flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${drawerOpen ? "translate-x-0" : "translate-x-full"}
        `}
        style={{
          background: "linear-gradient(180deg, #0A0E17 0%, #070B14 100%)",
          borderLeft: "1px solid rgba(0,212,255,0.06)",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
          // s'arrête au-dessus de la BottomNav mobile (64px) + safe-area iOS
          bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <Link href="/" onClick={() => setDrawerOpen(false)} className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-blanc.svg" alt="" aria-hidden className="h-7 w-auto object-contain" />
            <span style={{
              fontFamily: "var(--cn-display)",
              fontSize: "14px",
              fontWeight: 700,
              background: "linear-gradient(90deg, #00D4FF 0%, #7c4dff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              CardMetrics
            </span>
          </Link>
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-11 h-11 rounded-lg flex items-center justify-center text-[#475569] hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Fermer le menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Drawer content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Search shortcut */}
          <button
            onClick={openSearch}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl mb-5 transition-all duration-200"
            style={{
              background: "rgba(0,212,255,0.04)",
              border: "1px solid rgba(0,212,255,0.1)",
            }}
          >
            <Search size={14} className="text-[#00D4FF]/60" />
            <span className="text-[13px] text-[#475569]">Rechercher un joueur…</span>
          </button>

          {isAuthed && (
            <Link
              href="/dashboard"
              onClick={() => setDrawerOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 mb-3 transition-all duration-150 border ${
                pathname === "/dashboard"
                  ? "bg-[#00D4FF]/[0.08] border-[#00D4FF]/20 text-white"
                  : "text-[#94A3B8] hover:text-white hover:bg-white/[0.04] border-transparent"
              }`}
            >
              <div className="shrink-0 w-7 h-7 rounded-md bg-gradient-to-br from-[#00D4FF] to-[#0070f3] flex items-center justify-center">
                <LayoutDashboard size={13} className="text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium">Dashboard</div>
                <div className="text-[10px] text-[#475569] leading-snug">Ton hub personnel</div>
              </div>
            </Link>
          )}

          {NAV_ITEMS.map((item) => (
            <MobileNavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onClose={() => setDrawerOpen(false)}
            />
          ))}
        </div>

        {/* Drawer footer */}
        <div className="px-5 py-4 drawer-auth-footer" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[10px] text-emerald-400/60 font-medium uppercase tracking-wider">Connecté à eBay</span>
            </div>
            <PrefsToggle />
          </div>
          <AuthButton />
        </div>
      </div>

      {/* ── Search overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
      {searchOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Recherche joueur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <motion.div
            className="absolute inset-0"
            onClick={closeSearch}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
          />

          <motion.div
            className="relative w-full max-w-lg rounded-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: "spring", stiffness: 440, damping: 30 }}
            style={{
              background: "linear-gradient(180deg, rgba(15,23,42,0.99), rgba(8,12,21,1))",
              border: "1px solid rgba(0,212,255,0.1)",
              boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 80px rgba(0,212,255,0.05), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <motion.div
                animate={{ rotate: loading ? 360 : 0 }}
                transition={{ duration: 1, repeat: loading ? Infinity : 0, ease: "linear" }}
              >
                <Sparkles size={16} className="text-[#00D4FF]/50 shrink-0" />
              </motion.div>
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent text-[15px] text-white placeholder:text-[#334155] outline-none"
                placeholder="Quel joueur veux-tu analyser ?"
                value={query}
                onChange={handleInput}
                onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                autoComplete="off"
              />
              <motion.button
                type="button"
                onClick={closeSearch}
                className="shrink-0 px-2 py-1 rounded-md text-[11px] text-[#475569] font-mono"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                whileHover={{ color: "#94A3B8", background: "rgba(255,255,255,0.07)" }}
                whileTap={{ scale: 0.95 }}
              >
                ESC
              </motion.button>
            </div>

            {/* Recent searches */}
            <AnimatePresence>
            {query.trim().length < 2 && recent.length > 0 && (
              <motion.div
                key="recents"
                className="p-2.5"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                <div className="flex items-center justify-between px-2 pb-2">
                  <span className="text-[10px] text-[#334155] font-semibold uppercase tracking-widest">Récents</span>
                  <button
                    type="button"
                    onClick={clearRecent}
                    className="text-[10px] text-[#334155] hover:text-[#64748B] transition-colors"
                  >
                    Effacer
                  </button>
                </div>
                <ul role="listbox">
                  {recent.map((entry, i) => (
                    <motion.li
                      key={entry.id ?? entry.name ?? i}
                      role="option"
                      aria-selected={false}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, type: "spring", stiffness: 380, damping: 22 }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectRecent(entry)}
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all group"
                      >
                        {entry.headshotUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={entry.headshotUrl} alt="" width={32} height={32}
                            className="rounded-full object-cover ring-1 ring-white/[0.06]" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center ring-1 ring-white/[0.06]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#334155]">
                              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                            </svg>
                          </span>
                        )}
                        <div className="flex-1 text-left">
                          <div className="text-[13px] font-medium text-[#94A3B8] group-hover:text-white transition-colors">
                            {entry.name}
                          </div>
                          {entry.team && (
                            <div className="text-[10px] text-[#334155]">{entry.team}</div>
                          )}
                        </div>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            )}
            </AnimatePresence>

            {/* Search results */}
            <AnimatePresence mode="wait">
            {(results.length > 0 || loading) && (
              <motion.ul
                key="results"
                className="p-2.5"
                role="listbox"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                {loading && results.length === 0 && (
                  <li className="px-4 py-4 flex items-center justify-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-[#00D4FF]/30 border-t-[#00D4FF] animate-spin" />
                    <span className="text-[12px] text-[#475569]">Analyse en cours…</span>
                  </li>
                )}
                {results.slice(0, 8).map((p, i) => (
                  <motion.li
                    key={p.playerId ?? p.id}
                    role="option"
                    aria-selected={false}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.045, type: "spring", stiffness: 380, damping: 22 }}
                  >
                    <motion.button
                      type="button"
                      onClick={() => handleSelect(p)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors group"
                      whileHover={{ background: "rgba(0,212,255,0.05)" }}
                      whileTap={{ scale: 0.99 }}
                    >
                      {p.headshotUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.headshotUrl} alt="" width={36} height={36}
                          className="rounded-full object-cover ring-1 ring-white/[0.08]" />
                      )}
                      <div className="flex-1 text-left">
                        <div className="text-[13px] font-semibold text-[#CBD5E1] group-hover:text-white transition-colors">
                          {p.name ?? p.fullName}
                        </div>
                        <div className="text-[11px] text-[#475569]">
                          {p.team ?? p.teamName ?? p.currentTeamAbbrev ?? "—"} · {p.position ?? p.positionCode ?? "—"}
                        </div>
                      </div>
                      <motion.div
                        className="shrink-0 text-[#334155]"
                        whileHover={{ color: "#00D4FF", x: 2 }}
                        transition={{ duration: 0.15 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </motion.div>
                    </motion.button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
            </AnimatePresence>

            {/* Empty state */}
            <AnimatePresence>
            {query.trim().length >= 2 && !loading && results.length === 0 && (
              <motion.div
                key="empty"
                className="px-4 py-8 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="text-[13px] text-[#334155]">
                  Aucun joueur trouvé pour «&nbsp;<span className="text-[#64748B]">{query}</span>&nbsp;»
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      </NavPortal>
    </>
  );
}
