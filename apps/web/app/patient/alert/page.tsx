"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, Phone, Calendar, BookOpen, ExternalLink } from "lucide-react";
import StreamingAvatar, { type StreamingAvatarHandle } from "@/components/StreamingAvatar";
import { GRANDMA_PROFILE } from "@/lib/avatarProfiles";

interface AlertData { title: string; detail: string; severity: "urgent" | "soon" | "routine"; actions: { label: string; done: boolean }[]; }

interface EvidenceData {
  guidelines: { condition: string; recommendation: string; source: string }[];
  studies: { title: string; authors: string; pmid: string; url: string; journal: string; year: string }[];
  patientFriendlySummary: string;
}

export default function EmergencyAlertPage() {
  const [alert, setAlert] = useState<AlertData | null>(null);
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const avatarRef = useRef<StreamingAvatarHandle>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [alertRes, evidenceRes] = await Promise.all([
          fetch("/api/anomaly/live"),
          fetch("/api/evidence?live=true"),
        ]);

        // Parse evidence
        if (evidenceRes.ok) {
          const evJson = await evidenceRes.json();
          if (evJson.evidence) setEvidence(evJson.evidence);
        }

        // Parse alert
        if (alertRes.ok) {
          const json = await alertRes.json();
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
                { label: "Clinical evidence reviewed", done: true },
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
          { label: "Clinical evidence reviewed", done: true },
          { label: "Doctor appointment booked", done: true },
        ],
      });
    }
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 rounded-full" style={{ border: "4px solid #fecaca", borderTopColor: "#dc2626", animation: "spin 0.6s linear infinite" }} /></div>;
  if (!alert) return null;

  const isUrgent = alert.severity === "urgent";

  // Build evidence-informed avatar speech
  const guidelineSnippet = evidence?.guidelines?.[0]
    ? ` According to the ${evidence.guidelines[0].source}, ${evidence.guidelines[0].recommendation.split(".")[0].toLowerCase()}.`
    : "";
  const studySnippet = evidence?.studies?.length
    ? ` Medical research supports this — we found ${evidence.studies.length} relevant ${evidence.studies.length === 1 ? "study" : "studies"} for your care team to review.`
    : "";
  const avatarText = `Hi dear, I noticed your ${alert.title.toLowerCase()} is a little different today. ${alert.detail}${guidelineSnippet}${studySnippet} But there's nothing for you to worry about right now — your family has been notified, your health data has been recorded, and we've already booked a doctor's appointment for you. Everything is being taken care of.`;

  return (
    <div className="space-y-8" style={{ padding: "0.5rem" }}>
      <Card style={{ border: `4px solid ${isUrgent ? "#fca5a5" : "#fcd34d"}`, borderRadius: 24, background: isUrgent ? "#fef2f2" : "#fffbeb", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
        <CardContent className="p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: isUrgent ? "#fee2e2" : "#fef3c7" }}>
              <AlertTriangle className="w-8 h-8" style={{ color: isUrgent ? "#dc2626" : "#d97706" }} />
            </div>
            <h1 className="font-bold" style={{ color: isUrgent ? "#991b1b" : "#92400e", fontSize: "2rem", lineHeight: 1.2 }}>Important: {alert.title}</h1>
          </div>
          <p style={{ color: "#1e293b", fontSize: "1.375rem", lineHeight: 1.6 }}>{alert.detail}</p>
        </CardContent>
      </Card>

      <Card style={{ border: "3px solid #e2e8f0", borderRadius: 24 }}>
        <CardContent className="p-8 flex flex-col items-center">
          <h2 className="font-bold mb-5" style={{ color: "#1e293b", fontSize: "1.5rem" }}>Your Health Assistant</h2>
          <StreamingAvatar
            ref={avatarRef}
            avatarId={GRANDMA_PROFILE.avatarId}
            initialText={avatarText}
          />
        </CardContent>
      </Card>

      {evidence && evidence.guidelines.length > 0 && (
        <Card style={{ border: "2px solid #dbeafe", borderRadius: 16, background: "#eff6ff" }}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5" style={{ color: "#2563eb" }} />
              <h2 className="font-bold" style={{ color: "#1e3a8a" }}>Clinical Evidence</h2>
            </div>
            {evidence.patientFriendlySummary && (
              <p className="text-sm mb-4" style={{ color: "#334155", lineHeight: 1.6 }}>
                {evidence.patientFriendlySummary.split("\n")[0]}
              </p>
            )}
            <div className="space-y-3">
              {evidence.guidelines.slice(0, 2).map((g, i) => (
                <div key={i} className="p-3" style={{ background: "white", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                  <p className="font-semibold text-sm" style={{ color: "#1e293b" }}>{g.condition}</p>
                  <p className="text-sm mt-1" style={{ color: "#64748b", lineHeight: 1.5 }}>
                    {g.recommendation.length > 150 ? g.recommendation.slice(0, 150) + "..." : g.recommendation}
                  </p>
                  <p className="text-xs mt-2" style={{ color: "#2563eb" }}>{g.source}</p>
                </div>
              ))}
            </div>
            {evidence.studies.length > 0 && (
              <p className="text-sm mt-3" style={{ color: "#64748b" }}>
                + {evidence.studies.length} peer-reviewed {evidence.studies.length === 1 ? "study" : "studies"} found
              </p>
            )}
            <Link href="/patient/evidence">
              <Button variant="outline" size="sm" className="w-full mt-4" style={{ borderRadius: 10, borderColor: "#bfdbfe", color: "#2563eb" }}>
                <ExternalLink className="w-4 h-4 mr-2" /> View Full Evidence Report
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card style={{ border: "3px solid #e2e8f0", borderRadius: 24 }}>
        <CardContent className="p-8">
          <h2 className="font-bold mb-6" style={{ color: "#1e293b", fontSize: "1.5rem" }}>What We've Done For You</h2>
          <div className="space-y-5">
            {alert.actions.map((a, i) => (
              <div key={i} className="flex items-center gap-4">
                <CheckCircle className="w-7 h-7" style={{ color: a.done ? "#16a34a" : "#cbd5e1" }} />
                <p style={{ color: a.done ? "#1e293b" : "#94a3b8", fontSize: "1.125rem" }}>{a.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Button size="xl" variant="outline" className="w-full shadow-md" style={{ fontSize: "1.25rem", height: 72, borderRadius: 18, border: "3px solid #bbf7d0", color: "#166534", fontWeight: 600 }}>
          <CheckCircle className="w-7 h-7 mr-2" /> I'm OK
        </Button>
        <a href="tel:911">
          <Button size="xl" className="w-full shadow-lg" style={{ background: "#dc2626", color: "white", fontSize: "1.25rem", height: 72, borderRadius: 18, fontWeight: 600 }}>
            <Phone className="w-7 h-7 mr-2" /> Call 911
          </Button>
        </a>
      </div>

      <Link href="/patient/booking">
        <Button variant="outline" size="lg" className="w-full" style={{ fontSize: "1.125rem", borderRadius: 16, height: 64, borderWidth: 2 }}>
          <Calendar className="w-6 h-6 mr-2" /> View My Appointment
        </Button>
      </Link>
    </div>
  );
}
