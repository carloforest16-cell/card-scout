"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import "./nav-progress.css";

export default function NavProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef(null);
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    clearTimeout(timerRef.current);
    setWidth(0);
    setVisible(true);

    let start = null;
    let frame;

    function animate(ts) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(90, (elapsed / 400) * 90);
      setWidth(progress);
      if (progress < 90) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);

    timerRef.current = setTimeout(() => {
      cancelAnimationFrame(frame);
      setWidth(100);
      setTimeout(() => setVisible(false), 300);
    }, 500);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timerRef.current);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="np-bar"
      style={{ width: `${width}%` }}
      role="progressbar"
      aria-hidden
    />
  );
}
