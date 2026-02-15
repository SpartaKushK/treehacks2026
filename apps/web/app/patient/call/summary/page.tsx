"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, FileText, Home, Calendar } from "lucide-react";
import SOAPNoteView from "@/components/SOAPNoteView";
import ClinicalSidebar from "@/components/ClinicalSidebar";
import type { SOAPNote, ClinicalEntities, ConversationMessage } from "@/lib/voice/types";
import { emptyClinicalEntities } from "@/lib/voice/types";

export default function CallSummaryPage() {
  const [soapNote, setSoapNote] = useState<SOAPNote | null>(null);
  const [entities, setEntities] = useState<ClinicalEntities>(emptyClinicalEntities());
  const [actions, setActions] = useState<{ label: string; done: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function generateSummary() {
      try {
        const raw = sessionStorage.getItem("voiceCallData");
        if (!raw) {
          setError("No call data found. Please start a consultation first.");
          setLoading(false);
          return;
        }

        const callData = JSON.parse(raw) as {
          messages: ConversationMessage[];
          entities: ClinicalEntities;
          healthData: Record<string, unknown> | null;
          callDuration: number;
          automatedActions: { label: string; done: boolean }[];
        };

        setEntities(callData.entities);
        setActions(callData.automatedActions || []);

        // Generate SOAP note via API
        const res = await fetch("/api/voice/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: callData.messages,
            entities: callData.entities,
            healthData: callData.healthData,
            callDuration: callData.callDuration,
          }),
        });

        if (!res.ok) throw new Error("Failed to generate summary");

        const data = await res.json();
        setSoapNote(data.soapNote);

        // Add any newly triggered actions
        if (data.actions && data.actions.length > 0) {
          const newActions = data.actions.map((a: string) => ({
            label: a === "triage_urgent"
              ? "Urgent triage completed"
              : a === "family_notified"
                ? "Family members notified"
                : a === "medication_followup"
                  ? "Medication follow-up scheduled"
                  : a,
            done: true,
          }));
          setActions((prev) => {
            const existing = new Set(prev.map((a) => a.label));
            return [...prev, ...newActions.filter((a: { label: string }) => !existing.has(a.label))];
          });
        }
      } catch (err) {
        console.error("Summary generation error:", err);
        setError("Failed to generate consultation summary. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    generateSummary();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div
          className="w-12 h-12 rounded-full"
          style={{
            border: "4px solid #dbeafe",
            borderTopColor: "#2563eb",
            animation: "spin 0.6s linear infinite",
          }}
        />
        <p className="text-sm" style={{ color: "#64748b" }}>
          Generating clinical summary...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 py-8">
        <Card style={{ border: "2px solid #fecaca", borderRadius: 16, background: "#fef2f2" }}>
          <CardContent className="p-6 text-center">
            <p style={{ color: "#991b1b" }}>{error}</p>
          </CardContent>
        </Card>
        <Link href="/patient">
          <Button size="lg" className="w-full" style={{ borderRadius: 12 }}>
            <Home className="w-5 h-5 mr-2" /> Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#dcfce7" }}>
          <CheckCircle className="w-5 h-5" style={{ color: "#16a34a" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0f172a" }}>
            Consultation Complete
          </h1>
          <p className="text-sm" style={{ color: "#64748b" }}>
            Clinical summary generated from your voice consultation
          </p>
        </div>
      </div>

      {/* SOAP Note */}
      {soapNote && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5" style={{ color: "#2563eb" }} />
            <h2 className="text-lg font-bold" style={{ color: "#1e293b" }}>
              SOAP Note
            </h2>
          </div>
          <SOAPNoteView note={soapNote} />
        </div>
      )}

      {/* Extracted Entities & Actions */}
      <Card style={{ border: "1px solid #e2e8f0", borderRadius: 14 }}>
        <CardContent className="p-4">
          <h2 className="text-sm font-bold mb-3" style={{ color: "#1e293b" }}>
            Extracted Clinical Data & Actions
          </h2>
          <ClinicalSidebar entities={entities} actions={actions} />
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/patient">
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            style={{ borderRadius: 12, height: 48 }}
          >
            <Home className="w-5 h-5 mr-2" /> Home
          </Button>
        </Link>
        <Link href="/patient/appointments">
          <Button
            size="lg"
            className="w-full"
            style={{ borderRadius: 12, height: 48, background: "#2563eb", color: "#fff" }}
          >
            <Calendar className="w-5 h-5 mr-2" /> Appointments
          </Button>
        </Link>
      </div>
    </div>
  );
}
