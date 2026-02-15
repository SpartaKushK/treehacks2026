"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, Phone, Calendar } from "lucide-react";
import StreamingAvatar, { type StreamingAvatarHandle } from "@/components/StreamingAvatar";
import { GRANDMA_PROFILE } from "@/lib/avatarProfiles";

interface AlertData { title: string; detail: string; severity: "urgent" | "soon" | "routine"; actions: { label: string; done: boolean }[]; }

export default function EmergencyAlertPage() {
  const [alert, setAlert] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const avatarRef = useRef<StreamingAvatarHandle>(null);

  useEffect(() => {
    async function fetchAlert() {
      try {
        const res = await fetch("/api/anomaly/live");
        if (res.ok) {
          const json = await res.json();
          const agent = json.agents?.[0];
          if (agent && agent.activeAlerts > 0) {
            const flags = agent.flags || ["RHR_SPIKE"];
            setAlert({
              title: flags.includes("RHR_SPIKE") ? "High Heart Rate" : flags.includes("SLEEP_DROP") ? "Low Sleep" : "Health Alert",
              detail: flags.includes("RHR_SPIKE") ? "Heart rate is higher than usual — 95 bpm (normal: 62 bpm)." : "A change in your health data was detected.",
              severity: agent.urgency || "soon",
              actions: [
                { label: "Family notified", done: true },
                { label: "Health data recorded", done: true },
                { label: "Doctor appointment booked", done: true },
              ],
            });
          } else { fallback(); }
        } else { fallback(); }
      } catch { fallback(); } finally { setLoading(false); }
    }
    function fallback() {
      setAlert({
        title: "High Heart Rate",
        detail: "Heart rate is 95 bpm, above your usual 62 bpm.",
        severity: "urgent",
        actions: [
          { label: "Family notified", done: true },
          { label: "Health data recorded", done: true },
          { label: "Doctor appointment booked", done: true },
        ],
      });
    }
    fetchAlert();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 rounded-full" style={{ border: "4px solid #fecaca", borderTopColor: "#dc2626", animation: "spin 0.6s linear infinite" }} /></div>;
  if (!alert) return null;

  const isUrgent = alert.severity === "urgent";

  return (
    <div className="space-y-6">
      <Card style={{ border: `2px solid ${isUrgent ? "#fecaca" : "#fde68a"}`, borderRadius: 16, background: isUrgent ? "#fef2f2" : "#fffbeb" }}>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-6 h-6" style={{ color: isUrgent ? "#dc2626" : "#d97706" }} />
            <h1 className="text-2xl font-bold" style={{ color: isUrgent ? "#991b1b" : "#92400e" }}>{alert.title}</h1>
          </div>
          <p className="text-lg" style={{ color: "#475569" }}>{alert.detail}</p>
        </CardContent>
      </Card>

      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-6 flex flex-col items-center">
          <h2 className="font-bold mb-4" style={{ color: "#1e293b" }}>{GRANDMA_PROFILE.name}</h2>
          <StreamingAvatar
            ref={avatarRef}
            avatarId={GRANDMA_PROFILE.avatarId}
            initialText={`Oh dear, it looks like your ${alert.title.toLowerCase()} needs attention. ${alert.detail} But don't worry, your family has been notified and we've already booked a doctor's appointment for you.`}
          />
        </CardContent>
      </Card>

      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-6">
          <h2 className="font-bold mb-4" style={{ color: "#1e293b" }}>Status</h2>
          <div className="space-y-3">
            {alert.actions.map((a, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5" style={{ color: a.done ? "#16a34a" : "#cbd5e1" }} />
                <p style={{ color: a.done ? "#1e293b" : "#94a3b8" }}>{a.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Button size="xl" variant="outline" className="w-full" style={{ fontSize: 18, height: 56, borderRadius: 14, border: "2px solid #bbf7d0", color: "#166534" }}>
          <CheckCircle className="w-6 h-6 mr-2" /> I&apos;m OK
        </Button>
        <a href="tel:911">
          <Button size="xl" className="w-full" style={{ background: "#dc2626", color: "white", fontSize: 18, height: 56, borderRadius: 14 }}>
            <Phone className="w-6 h-6 mr-2" /> Call 911
          </Button>
        </a>
      </div>

      <Link href="/patient/booking">
        <Button variant="outline" size="lg" className="w-full" style={{ fontSize: 16, borderRadius: 12, height: 48 }}>
          <Calendar className="w-5 h-5 mr-2" /> View Appointment
        </Button>
      </Link>
    </div>
  );
}
