"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import {
  Search, Store, Target, ScanLine, Activity,
  Mail, Award, BarChart2, Gavel, ChevronDown, X, Menu,
  Sparkles, Zap, LayoutDashboard,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AuthButton from "@/app/AuthButton";
import NotificationsBell from "@/app/components/NotificationsBell";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

/* ── Menu structure ──────────────────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: "Explorer",
    emoji: "🔍",
    items: [
      { href: "/deals",        label: "Marché",       description: "Recherche par joueur · scores IA",         icon: Store,    gradient: "from-[#ff1744] to-[#ff6d00]" },
      { href: "/encheres",     label: "Enchères",     description: "Enchères eBay en temps réel",              icon: Gavel,    gradient: "from-[#ef4444] to-[#f97316]" },
      { href: "/opportunites", label: "Opportunités", description: "Top 8 cartes sous-évaluées",               icon: Target,   gradient: "from-[#FFB800] to-[#ff6d00]" },
    ],
  },
  {
    label: "Analyser",
    emoji: "⚡",
    items: [
      { href: "/analyse", label: "Analyser",  description: "Score Card Metrics · analyse complète",      icon: ScanLine, gradient: "from-[#aa00ff] to-[#7c4dff]" },
      { href: "/pulse",   label: "Pulse",     description: "Tendances marché en temps réel",           icon: Activity, gradient: "from-[#f97316] to-[#ef4444]" },
      { href: "/picks",   label: "Picks",     description: "Sélections hebdo de l'IA",                icon: Mail,     gradient: "from-[#a78bfa] to-[#7c3aed]" },
    ],
  },
  {
    label: "Collecter",
    emoji: "💎",
    items: [
      { href: "/grading",    label: "Grading", description: "Estimation grade · PSA, BGS, SGC",    icon: Award,    gradient: "from-[#fbbf24] to-[#f97316]" },
      { href: "/portfolio",  label: "Vault",   description: "Ton portfolio · suivi de valeur",     icon: BarChart2, gradient: "from-[#10b981] to-[#0ea5e9]" },
    ],
  },
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

/* ── Dropdown (desktop) ──────────────────────────────────────────────────── */
function DropdownGroup({ group, pathname }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const closeTimer = useRef(null);
  const groupActive = group.items.some(
    (i) => pathname === i.href || pathname.startsWith(i.href)
  );

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleMouseEnter() {
    clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function handleMouseLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={`
          relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium
          transition-all duration-200 select-none group
          ${groupActive
            ? "text-white"
            : "text-[#64748B] hover:text-white"
          }
        `}
      >
        {/* Active glow background */}
        {groupActive && (
          <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#00D4FF]/10 to-[#0070f3]/10 border border-[#00D4FF]/20" />
        )}
        <span className="relative flex items-center gap-1.5">
          {group.label}
          <ChevronDown
            size={12}
            className={`opacity-50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {/* Dropdown panel */}
      <div
        className={`
          absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[280px]
          rounded-xl overflow-hidden z-[60]
          transition-all duration-200 origin-top
          ${open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}
        `}
        style={{
          background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(8,12,21,0.99))",
          border: "1px solid rgba(0,212,255,0.08)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,212,255,0.04), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div className="p-1.5">
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`
                  flex items-start gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 group/item
                  ${active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}
                `}
              >
                <div className={`shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${item.gradient} flex items-center justify-center mt-0.5 shadow-lg group-hover/item:shadow-xl transition-shadow`}
                  style={{ boxShadow: active ? "0 0 16px rgba(0,212,255,0.2)" : undefined }}
                >
                  <Icon size={14} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className={`text-[13px] font-semibold transition-colors ${active ? "text-[#00D4FF]" : "text-[#CBD5E1] group-hover/item:text-white"}`}>
                    {item.label}
                  </div>
                  <div className="text-[11px] text-[#475569] leading-snug mt-0.5">
                    {item.description}
                  </div>
                </div>
                {active && (
                  <div className="shrink-0 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00D4FF] shadow-[0_0_6px_rgba(0,212,255,0.6)]" />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Mobile accordion item ───────────────────────────────────────────────── */
function MobileGroup({ group, pathname, onClose }) {
  const [open, setOpen] = useState(false);
  const groupActive = group.items.some(
    (i) => pathname === i.href || pathname.startsWith(i.href)
  );

  return (
    <div className="border-b border-white/[0.05] last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`
          flex items-center justify-between w-full py-3.5 px-1
          text-[14px] font-semibold transition-colors
          ${groupActive ? "text-white" : "text-[#64748B]"}
        `}
      >
        <span className="flex items-center gap-2">
          <span className="text-[13px]">{group.emoji}</span>
          {group.label}
        </span>
        <ChevronDown size={14} className={`text-[#475569] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? "max-h-[400px] pb-3" : "max-h-0"}`}
      >
        <div className="pl-1 flex flex-col gap-0.5">
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`
                  flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150
                  ${active
                    ? "bg-[#00D4FF]/[0.08] border border-[#00D4FF]/20 text-white"
                    : "text-[#94A3B8] hover:text-white hover:bg-white/[0.04] border border-transparent"
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
          })}
        </div>
      </div>
    </div>
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
    function onResize() { if (window.innerWidth >= 1024) setDrawerOpen(false); }
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
          relative z-50 flex items-center justify-between h-14 px-4 lg:px-6
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
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div
            className="relative w-8 h-8 rounded-[10px] flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-200"
            style={{
              background: "linear-gradient(135deg, #00D4FF, #0070f3)",
              boxShadow: "0 0 20px rgba(0,212,255,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            <Zap size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <span
            style={{ fontFamily: "var(--cn-display)" }}
            className="text-[16px] font-bold tracking-tight"
          >
            <span className="text-white group-hover:text-[#00D4FF] transition-colors duration-200">Card</span>
            <span className="text-[#c8102e]">Metrics</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-1">
          {/* Search trigger */}
          <button
            onClick={openSearch}
            className="flex items-center gap-2.5 pl-3 pr-2.5 py-[6px] mr-2 rounded-lg transition-all duration-200 group/search"
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
            <span className="text-[12px] text-[#475569] group-hover/search:text-[#64748B] transition-colors w-[100px] text-left">
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

          {/* Grouped dropdowns */}
          {NAV_GROUPS.map((group) => (
            <DropdownGroup key={group.label} group={group} pathname={pathname} />
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Live indicator — desktop */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full mr-2"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.12)" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            </span>
            <span className="text-[10px] text-emerald-400/80 font-medium tracking-wide uppercase">Live</span>
          </div>

          {/* Notifications bell — desktop */}
          <div className="hidden lg:flex items-center mr-1">
            <NotificationsBell />
          </div>

          {/* Auth — desktop */}
          <div className="hidden lg:block">
            <AuthButton />
          </div>

          {/* Search icon — mobile */}
          <button
            onClick={openSearch}
            className="lg:hidden flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200"
            style={{
              background: "rgba(0,212,255,0.06)",
              border: "1px solid rgba(0,212,255,0.1)",
            }}
            aria-label="Rechercher"
          >
            <Search size={16} className="text-[#00D4FF]/70" />
          </button>

          {/* Hamburger — mobile */}
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="lg:hidden flex items-center justify-center w-11 h-11 rounded-xl text-[#94A3B8] hover:text-white transition-all duration-200"
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
          fixed inset-0 z-40 lg:hidden
          transition-opacity duration-300
          ${drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
        aria-hidden
      />
      <div
        className={`
          fixed top-0 right-0 bottom-0 z-50 w-[82vw] max-w-xs lg:hidden
          flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${drawerOpen ? "translate-x-0" : "translate-x-full"}
        `}
        style={{
          background: "linear-gradient(180deg, #0A0E17 0%, #070B14 100%)",
          borderLeft: "1px solid rgba(0,212,255,0.06)",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <Link href="/" onClick={() => setDrawerOpen(false)} className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #00D4FF, #0070f3)" }}
            >
              <Zap size={12} className="text-white" strokeWidth={2.5} />
            </div>
            <span style={{ fontFamily: "var(--cn-display)" }} className="text-[14px] font-bold">
              <span className="text-white">Card</span><span className="text-[#c8102e]">Scout</span>
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

          {NAV_GROUPS.map((group) => (
            <MobileGroup
              key={group.label}
              group={group}
              pathname={pathname}
              onClose={() => setDrawerOpen(false)}
            />
          ))}
        </div>

        {/* Drawer footer */}
        <div className="px-5 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-[10px] text-emerald-400/60 font-medium uppercase tracking-wider">Connecté à eBay</span>
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
                      key={entry.id}
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
