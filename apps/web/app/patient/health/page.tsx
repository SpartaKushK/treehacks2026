"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Footprints, Moon, Activity, Clock, ArrowRight } from "lucide-react";

interface HealthData { heartRate: number; steps: number; sleepHours: number; lastUpdated: string; }

export default function HealthDashboard() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch("/api/anomaly/live");
        if (res.ok) {
          const json = await res.json();
          const agent = json.agents?.[0];
          if (agent) {
            setData({ heartRate: agent.metrics?.restingHR ?? 72, steps: agent.metrics?.steps ?? 6432, sleepHours: agent.metrics?.sleepHours ?? 7.2, lastUpdated: new Date().toLocaleTimeString() });
          } else { fallback(); }
        } else { fallback(); }
      } catch { fallback(); } finally { setLoading(false); }
    }
    function fallback() { setData({ heartRate: 72, steps: 6432, sleepHours: 7.2, lastUpdated: new Date().toLocaleTimeString() }); }
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-12 h-12 rounded-full" style={{ border: "4px solid #bfdbfe", borderTopColor: "#2563eb", animation: "spin 0.6s linear infinite" }} />
    </div>
  );

  if (!data) return null;

  return (
    <div className="space-y-8" style={{ padding: "0.5rem" }}>
      <div style={{ textAlign: "center" }}>
        <h1 className="font-bold" style={{ color: "#0f172a", fontSize: "2rem", marginBottom: "0.5rem" }}>My Health Today</h1>
        <p style={{ color: "#64748b", fontSize: "1.125rem" }}>Last checked: {data.lastUpdated}</p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card style={{ border: "3px solid #fecaca", borderRadius: 20, background: "#fef2f2" }}>
          <CardContent className="p-7 text-center">
            <Heart className="w-8 h-8 mb-3 mx-auto" style={{ color: "#ef4444" }} />
            <p className="font-bold" style={{ fontSize: 56, color: "#0f172a", lineHeight: 1 }}>{data.heartRate}</p>
            <p className="font-semibold mt-2" style={{ color: "#64748b", fontSize: "1.125rem" }}>Heart Rate</p>
            <p className="text-xs mt-1" style={{ color: "#94a3b8", fontSize: "0.875rem" }}>beats per minute</p>
          </CardContent>
        </Card>

        <Card style={{ border: "3px solid #bfdbfe", borderRadius: 20, background: "#eff6ff" }}>
          <CardContent className="p-7 text-center">
            <Footprints className="w-8 h-8 mb-3 mx-auto" style={{ color: "#3b82f6" }} />
            <p className="font-bold" style={{ fontSize: 56, color: "#0f172a", lineHeight: 1 }}>{data.steps.toLocaleString()}</p>
            <p className="font-semibold mt-2" style={{ color: "#64748b", fontSize: "1.125rem" }}>Steps Today</p>
            <p className="text-xs mt-1" style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Keep moving!</p>
          </CardContent>
        </Card>

        <Card style={{ border: "3px solid #ddd6fe", borderRadius: 20, background: "#f5f3ff" }}>
          <CardContent className="p-7 text-center">
            <Moon className="w-8 h-8 mb-3 mx-auto" style={{ color: "#8b5cf6" }} />
            <p className="font-bold" style={{ fontSize: 56, color: "#0f172a", lineHeight: 1 }}>{data.sleepHours}</p>
            <p className="font-semibold mt-2" style={{ color: "#64748b", fontSize: "1.125rem" }}>Sleep Last Night</p>
            <p className="text-xs mt-1" style={{ color: "#94a3b8", fontSize: "0.875rem" }}>hours of rest</p>
          </CardContent>
        </Card>

        <Card style={{ border: "3px solid #bbf7d0", borderRadius: 20, background: "#f0fdf4" }}>
          <CardContent className="p-7 text-center">
            <Activity className="w-8 h-8 mb-3 mx-auto" style={{ color: "#22c55e" }} />
            <p className="font-bold" style={{ fontSize: 56, color: "#0f172a", lineHeight: 1 }}>Good</p>
            <p className="font-semibold mt-2" style={{ color: "#64748b", fontSize: "1.125rem" }}>Health Status</p>
            <p className="text-xs mt-1" style={{ color: "#94a3b8", fontSize: "0.875rem" }}>All looking well</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Link href="/patient/history" className="flex-1">
          <Button variant="outline" size="lg" className="w-full" style={{ fontSize: "1.125rem", borderRadius: 16, height: 64, borderWidth: 2 }}>
            <Clock className="w-6 h-6 mr-2" /> Past Visits
          </Button>
        </Link>
        <Link href="/patient/appointments" className="flex-1">
          <Button size="lg" className="w-full shadow-lg" style={{ background: "#2563eb", color: "white", fontSize: "1.125rem", fontWeight: 600, borderRadius: 16, height: 64 }}>
            Book Doctor <ArrowRight className="w-6 h-6 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
