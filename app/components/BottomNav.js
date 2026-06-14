"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Target, ScanLine, BarChart2, Home } from "lucide-react";
import "./bottom-nav.css";

const TABS = [
  { href: "/",           label: "Accueil",      Icon: Home,     gradient: "linear-gradient(135deg,#00d4ff,#0070f3)" },
  { href: "/deals",      label: "Marché",        Icon: Store,    gradient: "linear-gradient(135deg,#ff1744,#ff6d00)" },
  { href: "/opportunites", label: "Opport.",     Icon: Target,   gradient: "linear-gradient(135deg,#ffab00,#ff6d00)" },
  { href: "/analyse",    label: "Analyser",      Icon: ScanLine, gradient: "linear-gradient(135deg,#aa00ff,#7c4dff)" },
  { href: "/portfolio",  label: "Vault",         Icon: BarChart2,gradient: "linear-gradient(135deg,#10b981,#0ea5e9)" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bn-bar" aria-label="Navigation mobile">
      {TABS.map(({ href, label, Icon, gradient }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`bn-tab${active ? " bn-tab--active" : ""}`}
            style={{ "--bn-gradient": gradient }}
            aria-current={active ? "page" : undefined}
          >
            <span className="bn-tab__icon-wrap">
              <Icon className="bn-tab__icon" size={22} strokeWidth={active ? 2.4 : 1.8} />
            </span>
            <span className="bn-tab__label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
