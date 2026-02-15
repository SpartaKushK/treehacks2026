"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/dashboard/chat", label: "Chat", icon: "◬" },
  { href: "/dashboard/agents", label: "Care Team", icon: "◉" },
  { href: "/dashboard/anomaly", label: "Health Alerts", icon: "△" },
  { href: "/dashboard/calendar", label: "Schedule", icon: "▦" },
  { href: "/dashboard/demo", label: "Live Demo", icon: "▷" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Link href="/dashboard" style={{ textDecoration: "none", color: "var(--text)" }}>
          <strong>CareSync</strong>
        </Link>
        <span className="sidebar-logo-sub">Elderly Care Platform</span>
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
