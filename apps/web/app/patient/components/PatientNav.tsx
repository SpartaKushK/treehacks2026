"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Home, Calendar, Clock, Users, Settings } from "lucide-react";

const navItems = [
  { href: "/patient", label: "Home", icon: Home },
  { href: "/patient/health", label: "My Health", icon: Heart },
  { href: "/patient/appointments", label: "Doctors", icon: Calendar },
  { href: "/patient/history", label: "Past Days", icon: Clock },
  { href: "/patient/family", label: "Family", icon: Users },
  { href: "/patient/settings", label: "Settings", icon: Settings },
];

export default function PatientNav() {
  const pathname = usePathname();

  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "white", borderBottom: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <Link href="/patient" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Heart style={{ width: 20, height: 20, color: "white" }} />
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>CareSync</span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/patient" && pathname.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8,
                  fontSize: 14, fontWeight: 500, textDecoration: "none", transition: "all 0.15s",
                  background: isActive ? "#eff6ff" : "transparent",
                  color: isActive ? "#1d4ed8" : "#64748b",
                }}>
                  <item.icon style={{ width: 16, height: 16 }} />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
