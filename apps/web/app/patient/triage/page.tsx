"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";

const questions = [
  { question: "Any chest pain?", options: ["Yes, sharp", "Yes, dull", "Slight", "No"] },
  { question: "When did symptoms start?", options: ["Last hour", "Today", "Few days ago", "Comes and goes"] },
  { question: "Difficulty breathing?", options: ["At rest", "With activity", "Slightly", "No"] },
  { question: "Dizziness?", options: ["Nearly fainted", "Mild", "When standing", "No"] },
  { question: "Current medications?", options: ["Blood thinners", "BP medication", "Other heart meds", "None"] },
];

export default function TriagePage() {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(new Array(questions.length).fill(null));
  const [completed, setCompleted] = useState(false);

  if (completed) {
    return (
      <div style={{ maxWidth: 500, margin: "0 auto" }} className="text-center py-12 space-y-6">
        <CheckCircle className="w-16 h-16 mx-auto" style={{ color: "#16a34a" }} />
        <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>Submitted</h1>
        <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16, textAlign: "left" }}>
          <CardContent className="p-6">
            <h3 className="font-bold mb-3" style={{ color: "#1e293b" }}>Your Answers</h3>
            {questions.map((q, i) => (
              <div key={i} className="py-3" style={{ borderBottom: i < questions.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <p className="text-sm mb-1" style={{ color: "#64748b" }}>{q.question}</p>
                <p className="font-medium" style={{ color: "#1e293b" }}>{answers[i] !== null ? q.options[answers[i]!] : "—"}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Link href="/patient/booking">
          <Button size="xl" style={{ background: "#2563eb", color: "white", fontSize: 18, borderRadius: 12 }}>
            View Appointment <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </Link>
      </div>
    );
  }

  const q = questions[currentQ];
  const progress = ((currentQ + 1) / questions.length) * 100;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }} className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "#0f172a" }}>Pre-Visit Questions</h1>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span style={{ color: "#64748b" }}>{currentQ + 1} of {questions.length}</span>
          <span style={{ color: "#2563eb" }} className="font-medium">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-3" />
      </div>

      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-8">
          <h2 className="text-2xl font-bold mb-6" style={{ color: "#1e293b" }}>{q.question}</h2>
          <div className="space-y-3">
            {q.options.map((option, i) => (
              <button key={i} onClick={() => { const a = [...answers]; a[currentQ] = i; setAnswers(a); }}
                className="w-full text-left p-5 rounded-xl font-medium" style={{
                  border: answers[currentQ] === i ? "2px solid #2563eb" : "2px solid #e2e8f0",
                  background: answers[currentQ] === i ? "#eff6ff" : "white",
                  color: answers[currentQ] === i ? "#1d4ed8" : "#475569", fontSize: 18,
                }}>
                <span className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{
                    border: answers[currentQ] === i ? "2px solid #2563eb" : "2px solid #cbd5e1",
                    background: answers[currentQ] === i ? "#2563eb" : "transparent",
                  }}>
                    {answers[currentQ] === i && <span className="w-2 h-2 rounded-full" style={{ background: "white" }} />}
                  </span>
                  {option}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {currentQ > 0 && (
          <Button variant="outline" size="lg" className="flex-1" onClick={() => setCurrentQ(currentQ - 1)}
            style={{ fontSize: 18, borderRadius: 12, height: 52 }}>
            <ArrowLeft className="w-5 h-5 mr-2" /> Back
          </Button>
        )}
        <Button size="lg" className="flex-1" disabled={answers[currentQ] === null}
          onClick={() => { if (currentQ < questions.length - 1) setCurrentQ(currentQ + 1); else setCompleted(true); }}
          style={{ background: "#2563eb", color: "white", fontSize: 18, borderRadius: 12, height: 52 }}>
          {currentQ === questions.length - 1 ? "Submit" : "Next"} <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
