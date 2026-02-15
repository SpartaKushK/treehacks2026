import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Activity, Calendar, Moon, Users, Bell, Phone } from "lucide-react";

export default function PatientLanding() {
  const quickLinks = [
    { href: "/patient/health", icon: Heart, label: "My Health", subtitle: "Check my vitals", color: "#ef4444", bg: "#fef2f2" },
    { href: "/patient/appointments", icon: Calendar, label: "My Doctors", subtitle: "Book appointments", color: "#2563eb", bg: "#eff6ff" },
    { href: "/patient/history", icon: Activity, label: "Past Visits", subtitle: "See my history", color: "#16a34a", bg: "#f0fdf4" },
    { href: "/patient/family", icon: Users, label: "My Family", subtitle: "Family contacts", color: "#8b5cf6", bg: "#f5f3ff" },
    { href: "/patient/alert", icon: Bell, label: "Reminders", subtitle: "Important notes", color: "#d97706", bg: "#fffbeb" },
    { href: "/patient/settings", icon: Moon, label: "Settings", subtitle: "My preferences", color: "#64748b", bg: "#f8fafc" },
  ];

  return (
    <div className="space-y-10" style={{ padding: "0.5rem" }}>
      <div style={{ textAlign: "center", paddingTop: "1rem" }}>
        <h1 className="font-bold" style={{ color: "#0f172a", fontSize: "2rem", marginBottom: "0.5rem" }}>Welcome Back!</h1>
        <p className="mt-2" style={{ color: "#64748b", fontSize: "1.25rem", lineHeight: 1.6 }}>
          Your Health Assistant is here to help
        </p>
      </div>

      <Link href="/patient/call">
        <Button size="xl" className="w-full shadow-lg" style={{ background: "#16a34a", color: "white", fontSize: "1.5rem", fontWeight: 700, borderRadius: 20, height: 80, marginBottom: "1rem" }}>
          <Phone className="w-8 h-8 mr-3" /> Call My Doctor Now
        </Button>
      </Link>

      <div className="grid grid-cols-2 gap-5">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card style={{ border: "3px solid #e2e8f0", borderRadius: 20, cursor: "pointer", minHeight: 160 }} className="hover:shadow-lg transition-all hover:scale-105">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: item.bg }}>
                  <item.icon className="w-9 h-9" style={{ color: item.color }} />
                </div>
                <p className="font-bold" style={{ color: "#1e293b", fontSize: "1.25rem", marginBottom: "0.25rem" }}>{item.label}</p>
                <p className="text-sm" style={{ color: "#64748b", fontSize: "0.95rem" }}>{item.subtitle}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Link href="/patient/onboarding">
        <Button size="xl" variant="outline" className="w-full" style={{ fontSize: "1.125rem", borderRadius: 16, height: 64, borderWidth: 2 }}>
          Set Up Health Device
        </Button>
      </Link>
    </div>
  );
}
