import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Activity, Calendar, Moon, Users, Bell } from "lucide-react";

export default function PatientLanding() {
  const quickLinks = [
    { href: "/patient/health", icon: Heart, label: "My Health", color: "#ef4444", bg: "#fef2f2" },
    { href: "/patient/appointments", icon: Calendar, label: "Appointments", color: "#2563eb", bg: "#eff6ff" },
    { href: "/patient/history", icon: Activity, label: "History", color: "#16a34a", bg: "#f0fdf4" },
    { href: "/patient/family", icon: Users, label: "Family", color: "#8b5cf6", bg: "#f5f3ff" },
    { href: "/patient/alert", icon: Bell, label: "Alerts", color: "#d97706", bg: "#fffbeb" },
    { href: "/patient/settings", icon: Moon, label: "Settings", color: "#64748b", bg: "#f8fafc" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>CareSync</h1>
        <p className="mt-1" style={{ color: "#64748b" }}>Your health at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16, cursor: "pointer" }} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: item.bg }}>
                  <item.icon className="w-7 h-7" style={{ color: item.color }} />
                </div>
                <p className="text-lg font-semibold" style={{ color: "#1e293b" }}>{item.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Link href="/patient/onboarding">
        <Button size="xl" className="w-full" style={{ background: "#2563eb", color: "white", fontSize: 18, borderRadius: 14, height: 56 }}>
          Set Up New Device
        </Button>
      </Link>
    </div>
  );
}
