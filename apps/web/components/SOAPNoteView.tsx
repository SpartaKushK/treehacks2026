"use client";

import type { SOAPNote } from "@/lib/voice/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  note: SOAPNote;
}

export default function SOAPNoteView({ note }: Props) {
  return (
    <div className="space-y-4">
      {/* Subjective */}
      <SoapSection title="S" subtitle="Subjective" color="#2563eb">
        <Field label="Chief Complaint">{note.subjective.chiefComplaint}</Field>
        <Field label="History of Present Illness">
          {note.subjective.historyOfPresentIllness}
        </Field>
        {note.subjective.reviewOfSystems.length > 0 && (
          <Field label="Review of Systems">
            <ul className="list-disc list-inside">
              {note.subjective.reviewOfSystems.map((ros, i) => (
                <li key={i}>{ros}</li>
              ))}
            </ul>
          </Field>
        )}
        {note.subjective.medications.length > 0 && (
          <Field label="Medications">
            {note.subjective.medications.join(", ")}
          </Field>
        )}
        {note.subjective.allergies.length > 0 && (
          <Field label="Allergies">
            {note.subjective.allergies.join(", ")}
          </Field>
        )}
      </SoapSection>

      {/* Objective */}
      <SoapSection title="O" subtitle="Objective" color="#16a34a">
        {note.objective.wearableData && (
          <Field label="Wearable Data">
            <div className="flex flex-wrap gap-2">
              {note.objective.wearableData.heartRate && (
                <Badge variant="outline">HR: {note.objective.wearableData.heartRate} bpm</Badge>
              )}
              {note.objective.wearableData.steps && (
                <Badge variant="outline">Steps: {note.objective.wearableData.steps.toLocaleString()}</Badge>
              )}
              {note.objective.wearableData.sleepHours && (
                <Badge variant="outline">Sleep: {note.objective.wearableData.sleepHours}h</Badge>
              )}
              {note.objective.wearableData.hrv && (
                <Badge variant="outline">HRV: {note.objective.wearableData.hrv}ms</Badge>
              )}
            </div>
          </Field>
        )}
        {note.objective.observations.length > 0 && (
          <Field label="Observations">
            <ul className="list-disc list-inside">
              {note.objective.observations.map((obs, i) => (
                <li key={i}>{obs}</li>
              ))}
            </ul>
          </Field>
        )}
      </SoapSection>

      {/* Assessment */}
      <SoapSection title="A" subtitle="Assessment" color="#d97706">
        <Field label="Primary Diagnosis">
          <div className="flex items-center gap-2">
            {note.assessment.primaryDiagnosis}
            <Badge
              variant={
                note.assessment.severity === "critical"
                  ? "danger"
                  : note.assessment.severity === "high"
                    ? "danger"
                    : note.assessment.severity === "medium"
                      ? "warning"
                      : "secondary"
              }
            >
              {note.assessment.severity.toUpperCase()}
            </Badge>
          </div>
        </Field>
        {note.assessment.differentialDiagnoses.length > 0 && (
          <Field label="Differential Diagnoses">
            {note.assessment.differentialDiagnoses.join(", ")}
          </Field>
        )}
      </SoapSection>

      {/* Plan */}
      <SoapSection title="P" subtitle="Plan" color="#8b5cf6">
        {note.plan.immediateActions.length > 0 && (
          <Field label="Immediate Actions">
            <ul className="list-disc list-inside">
              {note.plan.immediateActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Field>
        )}
        <Field label="Follow-Up">{note.plan.followUp}</Field>
        {note.plan.prescriptions.length > 0 && (
          <Field label="Prescriptions">
            {note.plan.prescriptions.join(", ")}
          </Field>
        )}
        {note.plan.referrals.length > 0 && (
          <Field label="Referrals">
            {note.plan.referrals.join(", ")}
          </Field>
        )}
        {note.plan.patientEducation.length > 0 && (
          <Field label="Patient Education">
            <ul className="list-disc list-inside">
              {note.plan.patientEducation.map((pe, i) => (
                <li key={i}>{pe}</li>
              ))}
            </ul>
          </Field>
        )}
      </SoapSection>

      {/* Metadata */}
      <Card style={{ border: "1px solid #e2e8f0", borderRadius: 12 }}>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: "#64748b" }}>
            <span>Generated: {new Date(note.metadata.generatedAt).toLocaleString()}</span>
            <span>Duration: {Math.round(note.metadata.conversationDuration / 1000)}s</span>
            <span>Utterances: {note.metadata.totalUtterances}</span>
            <span>Red Flags: {note.metadata.redFlagsDetected}</span>
          </div>
          {note.metadata.automatedActionsTriggered.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {note.metadata.automatedActionsTriggered.map((a, i) => (
                <Badge key={i} variant="success">{a}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SoapSection({
  title,
  subtitle,
  color,
  children,
}: {
  title: string;
  subtitle: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      <div
        style={{ background: color, color: "#fff", padding: "0.5rem 1rem" }}
        className="flex items-center gap-2"
      >
        <span className="text-lg font-bold">{title}</span>
        <span className="text-sm font-medium" style={{ opacity: 0.9 }}>
          {subtitle}
        </span>
      </div>
      <CardContent className="p-4 space-y-3">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold mb-0.5" style={{ color: "#64748b" }}>
        {label}
      </p>
      <div className="text-sm" style={{ color: "#1e293b" }}>
        {children}
      </div>
    </div>
  );
}
