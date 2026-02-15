"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/dashboard/chat", label: "Chat", icon: "◬" },
  { href: "/dashboard/agents", label: "Care Team", icon: "◉" },
  { href: "/dashboard/anomaly", label: "Health Alerts", icon: "△" },
  { href: "/dashboard/records", label: "Health Records", icon: "◫" },
  { href: "/dashboard/calendar", label: "Schedule", icon: "▦" },
  { href: "/dashboard/demo", label: "Live Demo", icon: "▷" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Link href="/dashboard" style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: "#1A7A6D", display: "flex",
            alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{ color: "white", fontSize: "1.1rem", fontWeight: 700, fontFamily: "'Bitter', Georgia, serif" }}>C</span>
          </div>
          <div>
            <strong>CareSync</strong>
            <span className="sidebar-logo-sub">Elderly Care Platform</span>
          </div>
        </Link>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${active ? "active" : ""}`}
            >
              <span className="sidebar-icon">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
