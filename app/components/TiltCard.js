"use client";

import { useRef } from "react";

/**
 * Card with subtle 3D tilt (±4°) following the cursor + radial spotlight.
 * Use on top of `.cn-card` or any container.
 */
export default function TiltCard({
  children,
  as: Tag = "div",
  className = "",
  maxTilt = 4,
  ...rest
}) {
  const ref = useRef(null);
  const rafRef = useRef(0);

  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;   // 0..1
    const py = (e.clientY - r.top) / r.height;
    const rx = (0.5 - py) * (maxTilt * 2);
    const ry = (px - 0.5) * (maxTilt * 2);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
    });
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--mx", "-50%");
    el.style.setProperty("--my", "-50%");
  };

  return (
    <Tag
      ref={ref}
      className={`cn-tilt ${className}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      {...rest}
    >
      <div className="cn-tilt__inner">{children}</div>
    </Tag>
  );
}
