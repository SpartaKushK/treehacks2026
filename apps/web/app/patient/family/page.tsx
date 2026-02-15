"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Moon, Footprints, Bell, Settings, Clock, Activity } from "lucide-react";

interface FamilyData { name: string; heartRate: number; steps: number; sleepHours: number;
  alerts: { message: string; severity: string; time: string; resolved: boolean }[]; }

export default function FamilyDashboardPage() {
  const [data, setData] = useState<FamilyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [liveRes, histRes] = await Promise.all([fetch("/api/anomaly/live"), fetch("/api/anomaly/history?limit=5")]);
        let live: any = null, alerts: any[] = [];
        if (liveRes.ok) { const j = await liveRes.json(); live = j.agents?.[0]; }
        if (histRes.ok) { const j = await histRes.json(); alerts = j.alerts || []; }
        if (live) {
          setData({ name: live.displayName || "Pari",
            heartRate: live.metrics?.restingHR ?? 72, steps: live.metrics?.steps ?? 6432, sleepHours: live.metrics?.sleepHours ?? 7.2,
            alerts: alerts.length ? alerts.map((a: any) => ({ message: a.summary || "Health change detected", severity: a.severity || "routine",
              time: new Date(a.createdAt).toLocaleDateString(), resolved: a.status === "resolved" })) : fallbackAlerts() });
        } else { fallback(); }
      } catch { fallback(); } finally { setLoading(false); }
    }
    function fallbackAlerts() {
      return [{ message: "Heart rate elevated — 95 bpm", severity: "urgent", time: "Today, 2:30 PM", resolved: false },
        { message: "Low sleep — 4.8 hours", severity: "soon", time: "Yesterday", resolved: true },
        { message: "Low step count", severity: "routine", time: "Feb 12", resolved: true }];
    }
    function fallback() { setData({ name: "Pari", heartRate: 78, steps: 4210, sleepHours: 5.8, alerts: fallbackAlerts() }); }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 rounded-full" style={{ border: "4px solid #bfdbfe", borderTopColor: "#2563eb", animation: "spin 0.6s linear infinite" }} /></div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>{data.name}&apos;s Wellbeing</h1>

      <Card style={{ border: "2px solid #bbf7d0", borderRadius: 16, background: "#f0fdf4" }}>
        <CardContent className="p-5">
          <p className="text-base font-medium" style={{ color: "#166534" }}>
            {data.heartRate > 90
              ? `${data.name}\u2019s heart rate is a bit elevated at ${data.heartRate} bpm. We\u2019re keeping an eye on it.`
              : data.sleepHours < 5
              ? `${data.name} didn\u2019t sleep as well last night (${data.sleepHours} hrs). CareSync is monitoring for patterns.`
              : `${data.name} is doing well today. Heart rate is steady at ${data.heartRate} bpm, sleep was ${data.sleepHours} hours, and she\u2019s been active with ${data.steps.toLocaleString()} steps.`}
          </p>
          <p className="text-sm mt-2" style={{ color: "#15803d" }}>
            CareSync is monitoring 24/7. You&apos;ll be the first to know if anything changes.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {[{ icon: Heart, color: "#ef4444", val: data.heartRate, unit: "bpm", label: "Heart" },
          { icon: Footprints, color: "#3b82f6", val: data.steps.toLocaleString(), unit: "steps", label: "Steps" },
          { icon: Moon, color: "#8b5cf6", val: data.sleepHours, unit: "hrs", label: "Sleep" }].map((m, i) => (
          <Card key={i} style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
            <CardContent className="p-5 text-center">
              <m.icon className="w-5 h-5 mx-auto mb-2" style={{ color: m.color }} />
              <p className="text-3xl font-bold" style={{ color: "#0f172a" }}>{m.val}</p>
              <p className="text-sm" style={{ color: "#64748b" }}>{m.unit}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4" style={{ color: "#1e293b" }}>
            <Bell className="w-5 h-5" style={{ color: "#d97706" }} /> Recent Updates
          </h2>
          <div className="space-y-3">
            {data.alerts.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#f8fafc" }}>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: a.severity === "urgent" ? "#ef4444" : a.severity === "soon" ? "#f59e0b" : "#3b82f6" }} />
                  <div>
                    <p className="font-medium" style={{ color: "#1e293b" }}>{a.message}</p>
                    <p className="text-sm flex items-center gap-1" style={{ color: "#94a3b8" }}><Clock className="w-3 h-3" /> {a.time}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                  background: a.resolved ? "#dcfce7" : "#fef3c7", color: a.resolved ? "#166534" : "#92400e"
                }}>{a.resolved ? "Resolved" : "Active"}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/patient/history"><Button variant="outline" size="lg" className="w-full" style={{ fontSize: 16, borderRadius: 12, height: 48 }}><Activity className="w-5 h-5 mr-2" /> History</Button></Link>
        <Link href="/patient/settings"><Button variant="outline" size="lg" className="w-full" style={{ fontSize: 16, borderRadius: 12, height: 48 }}><Settings className="w-5 h-5 mr-2" /> Settings</Button></Link>
      </div>
    </div>
  );
}
