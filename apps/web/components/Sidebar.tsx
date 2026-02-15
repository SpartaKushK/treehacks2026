"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, Users, AlertTriangle, ClipboardList, Calendar, Play, Mic, LucideIcon } from "lucide-react";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/agents", label: "Care Team", icon: Users },
  { href: "/dashboard/anomaly", label: "Patient Alerts", icon: AlertTriangle },
  { href: "/dashboard/records", label: "Health Records", icon: ClipboardList },
  { href: "/dashboard/calendar", label: "Schedule", icon: Calendar },
  { href: "/dashboard/voice-demo", label: "Voice AI Demo", icon: Mic },
  { href: "/dashboard/demo", label: "Live Demo", icon: Play },
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
            <span className="sidebar-logo-sub">Clinical Dashboard</span>
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
              <span className="sidebar-icon"><item.icon size={16} /></span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
