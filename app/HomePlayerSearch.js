"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";

function GooeyFilter() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <filter id="cs-gooey">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

export default function HomePlayerSearch({ compact = false, premium = false }) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestItems, setSuggestItems] = useState([]);

  const inputRef = useRef(null);
  const comboRef = useRef(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const isUnsupportedBrowser = useMemo(() => {
    if (typeof window === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium");
  }, []);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!comboRef.current?.contains(e.target)) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestItems([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      return;
    }
    setSuggestOpen(true);
    setSuggestItems([]);
    setSuggestLoading(true);
    let active = true;
    const t = setTimeout(async () => {
      if (!active) return;
      const captured = q;
      try {
        const res = await fetch(`/api/player?q=${encodeURIComponent(captured)}`);
        const data = await res.json();
        if (!active || queryRef.current.trim() !== captured) return;
        setSuggestItems(res.ok && Array.isArray(data.results) ? data.results : []);
      } catch {
        if (active && queryRef.current.trim() === captured) setSuggestItems([]);
      } finally {
        if (active && queryRef.current.trim() === captured) setSuggestLoading(false);
      }
    }, 280);
    return () => { active = false; clearTimeout(t); };
  }, [query]);

  function handleMouseMove(e) {
    if (!isFocused) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  function handleClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsClicked(true);
    setTimeout(() => setIsClicked(false), 700);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSuggestOpen(false);
    const q = query.trim();
    if (!q) return;
    if (suggestItems.length > 0 && suggestItems[0]?.playerId) {
      window.location.href = `/player/${suggestItems[0].playerId}`;
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 800);
  }

  const showSuggest = suggestOpen && query.trim().length >= 2;

  const particles = isFocused
    ? Array.from({ length: 12 }, (_, i) => (
        <motion.div
          key={`p-${i}`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            x: [(Math.random() - 0.5) * 60],
            y: [(Math.random() - 0.5) * 30],
            scale: [0, Math.random() * 0.6 + 0.3],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: Math.random() * 2 + 2,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "reverse",
          }}
          style={{
            position: "absolute",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: i % 3 === 0
              ? "rgba(0,212,255,0.7)"
              : i % 3 === 1
              ? "rgba(255,184,0,0.5)"
              : "rgba(226,232,240,0.4)",
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            filter: "blur(1px)",
            pointerEvents: "none",
          }}
        />
      ))
    : null;

  const clickParticles = isClicked
    ? Array.from({ length: 10 }, (_, i) => (
        <motion.div
          key={`cp-${i}`}
          initial={{ x: mousePos.x, y: mousePos.y, scale: 0, opacity: 1 }}
          animate={{
            x: mousePos.x + (Math.random() - 0.5) * 120,
            y: mousePos.y + (Math.random() - 0.5) * 60,
            scale: Math.random() * 0.7 + 0.2,
            opacity: [1, 0],
          }}
          transition={{ duration: Math.random() * 0.6 + 0.3, ease: "easeOut" }}
          style={{
            position: "absolute",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: i % 2 === 0 ? "#00D4FF" : "#FFB800",
            boxShadow: "0 0 6px rgba(0,212,255,0.8)",
            pointerEvents: "none",
          }}
        />
      ))
    : null;

  return (
    <div
      className={[
        "cs-search",
        compact ? "cs-search--compact" : "",
        premium ? "cs-search--premium" : "",
      ].filter(Boolean).join(" ")}
      ref={comboRef}
    >
      <GooeyFilter />

      <motion.form
        onSubmit={handleSubmit}
        className="cs-search__form"
        initial={false}
        animate={{
          scale: isFocused ? 1.015 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        onMouseMove={handleMouseMove}
      >
        <motion.div
          className="cs-search__track"
          onClick={handleClick}
          animate={{
            boxShadow: isClicked
              ? "0 0 0 1px rgba(0,212,255,0.8), 0 0 28px rgba(0,212,255,0.4), 0 0 8px rgba(255,184,0,0.3) inset"
              : isFocused
              ? "0 0 0 1px rgba(0,212,255,0.5), 0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(0,212,255,0.12)"
              : "0 0 0 1px rgba(30,41,59,0.8), 0 2px 8px rgba(0,0,0,0.3)",
          }}
          transition={{ duration: 0.25 }}
        >
          {/* Animated gradient background when focused */}
          <AnimatePresence>
            {isFocused && (
              <motion.div
                key="bg-gradient"
                className="cs-search__bg"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 0.12,
                  background: [
                    "linear-gradient(90deg, #00D4FF 0%, #FFB800 100%)",
                    "linear-gradient(90deg, #FFB800 0%, #00D4FF 100%)",
                    "linear-gradient(90deg, #00D4FF 0%, #FFB800 100%)",
                  ],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              />
            )}
          </AnimatePresence>

          {/* Particles */}
          <div
            className="cs-search__particles"
            style={{ filter: isUnsupportedBrowser ? "none" : "url(#cs-gooey)" }}
          >
            {particles}
          </div>

          {/* Click ripple */}
          <AnimatePresence>
            {isClicked && (
              <motion.div
                key="ripple"
                className="cs-search__ripple"
                initial={{ scale: 0, opacity: 0.5 }}
                animate={{ scale: 3, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>
          {clickParticles}

          {/* Search icon */}
          <motion.div
            className="cs-search__icon-wrap"
            animate={{
              rotate: isSubmitting ? [0, -12, 12, -8, 8, 0] : 0,
              scale: isSubmitting ? [1, 1.25, 1] : 1,
            }}
            transition={{ duration: 0.55, ease: "easeInOut" }}
          >
            <Search
              size={18}
              strokeWidth={isFocused ? 2.5 : 2}
              style={{
                color: isFocused ? "var(--ice)" : "var(--silver)",
                transition: "color 0.25s",
              }}
            />
          </motion.div>

          {/* Input */}
          <label htmlFor="cs-player-search" className="visually-hidden">
            Rechercher un joueur
          </label>
          <input
            ref={inputRef}
            id="cs-player-search"
            type="search"
            className="cs-search__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              if (query.trim().length >= 2) setSuggestOpen(true);
            }}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Nom du joueur — ex. McDavid"
            autoComplete="off"
            enterKeyHint="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggest}
            aria-controls="cs-suggest-list"
            aria-haspopup="listbox"
          />

          {/* Submit button — appears when typing */}
          <AnimatePresence>
            {query.trim().length > 0 && (
              <motion.button
                key="submit-btn"
                type="submit"
                className="cs-search__submit"
                initial={{ opacity: 0, scale: 0.85, x: 8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: 8 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                aria-label="Rechercher"
              >
                Analyser
              </motion.button>
            )}
          </AnimatePresence>

          {/* Shimmer sweep on focus */}
          <AnimatePresence>
            {isFocused && (
              <motion.div
                key="shimmer"
                className="cs-search__shimmer"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.18, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.5, repeat: Infinity, repeatType: "loop" }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      </motion.form>

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {showSuggest && (
          <motion.div
            key="dropdown"
            id="cs-suggest-list"
            className="cs-search__dropdown"
            role="listbox"
            aria-label="Suggestions de joueurs"
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {suggestLoading ? (
              <p className="cs-search__dropdown-status">Recherche…</p>
            ) : suggestItems.length === 0 ? (
              <p className="cs-search__dropdown-status">Aucun joueur trouvé</p>
            ) : (
              <ul className="cs-search__suggest-list">
                {suggestItems.slice(0, 8).map((player, i) => {
                  const key = `${player.playerId ?? "np"}-${player.name}-${i}`;
                  const team = player.team ?? (player.isActive ? "—" : "Retraité");
                  const pos = player.position ?? "—";

                  const inner = (
                    <motion.span
                      className="cs-search__suggest-inner"
                      custom={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.045, type: "spring", stiffness: 320, damping: 18 }}
                    >
                      <span className="cs-search__suggest-name">
                        {player.name}
                        <span
                          className={`cs-search__suggest-badge ${player.isActive ? "cs-search__suggest-badge--active" : "cs-search__suggest-badge--retired"}`}
                        >
                          {player.isActive ? "Actif" : "Retraité"}
                        </span>
                      </span>
                      <span className="cs-search__suggest-meta">
                        <span>{team}</span>
                        <span className="cs-search__suggest-sep" aria-hidden>·</span>
                        <span>{pos}</span>
                      </span>
                    </motion.span>
                  );

                  if (player.playerId) {
                    return (
                      <li key={key} role="option" className="cs-search__suggest-item" style={{ opacity: player.isActive ? 1 : 0.6 }}>
                        <Link
                          href={`/player/${player.playerId}`}
                          className="cs-search__suggest-link"
                          onClick={() => setSuggestOpen(false)}
                        >
                          {inner}
                        </Link>
                      </li>
                    );
                  }
                  return (
                    <li key={key} role="option" aria-disabled="true" className="cs-search__suggest-item cs-search__suggest-item--disabled" style={{ opacity: 0.5 }}>
                      <span className="cs-search__suggest-link cs-search__suggest-link--static">{inner}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
