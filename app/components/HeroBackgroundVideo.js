"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

/**
 * Cinematic video layer for the hero background.
 * Drops in behind the existing grid/logo/text — if `src` 404s the browser
 * just paints nothing here, so the current grid background still shows
 * through as a graceful fallback until the real clip is uploaded.
 */
export default function HeroBackgroundVideo({
  src = "/video/hero-bg.mp4",
  webmSrc = "/video/hero-bg.webm",
  poster = "/video/hero-bg-poster.jpg",
}) {
  const ref = useRef(null);
  const shouldReduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 1], shouldReduceMotion ? [1, 1] : [1, 1.12]);
  const y = useTransform(scrollYProgress, [0, 1], shouldReduceMotion ? ["0%", "0%"] : ["0%", "12%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  return (
    <motion.div ref={ref} className="hc-hero-video" style={{ opacity }} aria-hidden>
      <motion.video
        className="hc-hero-video__el"
        style={{ scale, y }}
        autoPlay={!shouldReduceMotion}
        muted
        loop
        playsInline
        preload="metadata"
        poster={poster}
      >
        <source src={webmSrc} type="video/webm" />
        <source src={src} type="video/mp4" />
      </motion.video>
      <div className="hc-hero-video__overlay" />
    </motion.div>
  );
}
