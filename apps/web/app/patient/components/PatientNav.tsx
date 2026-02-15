"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, Calendar, Clock, Users, Settings, BookOpen, LayoutDashboard, Mic } from "lucide-react";

const navItems = [
  { href: "/patient", label: "Home", icon: Home },
  { href: "/patient/health", label: "My Health", icon: Heart },
  { href: "/patient/evidence", label: "My Records", icon: BookOpen },
  { href: "/patient/appointments", label: "My Doctors", icon: Calendar },
  { href: "/patient/history", label: "Past Visits", icon: Clock },
  { href: "/patient/family", label: "My Family", icon: Users },
  { href: "/patient/voice-demo", label: "Voice AI", icon: Mic },
  { href: "/patient/settings", label: "Settings", icon: Settings },
];

export default function PatientNav() {
  const pathname = usePathname();

  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "white", borderBottom: "2px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.08)" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
          <Link href="/patient" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Heart style={{ width: 24, height: 24, color: "white" }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Health Assistant</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: -2 }}>Your personal care helper</div>
            </div>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/patient" && pathname.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href} style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", borderRadius: 10,
                  fontSize: 15, fontWeight: 600, textDecoration: "none", transition: "all 0.2s",
                  background: isActive ? "#dbeafe" : "transparent",
                  color: isActive ? "#1e40af" : "#64748b",
                }}>
                  <item.icon style={{ width: 18, height: 18 }} />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
            <Link href="/dashboard" style={{
              display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", borderRadius: 10,
              fontSize: 15, fontWeight: 600, textDecoration: "none", transition: "all 0.2s",
              background: "#f1f5f9", color: "#475569", borderLeft: "2px solid #cbd5e1", marginLeft: 6,
            }}>
              <LayoutDashboard style={{ width: 18, height: 18 }} />
              <span className="hidden md:inline">Staff View</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
