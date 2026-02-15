"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Watch, Users, Heart, CheckCircle, ArrowRight, ArrowLeft } from "lucide-react";

const steps = [
  { title: "Device", icon: Watch },
  { title: "Contacts", icon: Users },
  { title: "Profile", icon: Heart },
];

const conditions = [
  "Heart Problems", "Diabetes", "High Blood Pressure",
  "Joint Pain", "Breathing Issues", "None",
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [contacts, setContacts] = useState([{ name: "", phone: "" }]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const progressValue = ((step + 1) / steps.length) * 100;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }} className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "#0f172a" }}>Setup</h1>

      <div className="space-y-2">
        <div className="flex justify-between text-sm" style={{ color: "#64748b" }}>
          <span>Step {step + 1} of {steps.length}</span>
          <span>{steps[step].title}</span>
        </div>
        <Progress value={progressValue} className="h-3" />
      </div>

      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-8">
          {step === 0 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto" style={{ background: "#eff6ff" }}>
                <Watch className="w-10 h-10" style={{ color: "#2563eb" }} />
              </div>
              <h2 className="text-2xl font-bold" style={{ color: "#1e293b" }}>Connect Apple Watch</h2>
              <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "#f0fdf4" }}>
                <CheckCircle className="w-6 h-6 flex-shrink-0" style={{ color: "#16a34a" }} />
                <div className="text-left">
                  <p className="font-medium" style={{ color: "#166534" }}>Watch Found</p>
                  <p className="text-sm" style={{ color: "#16a34a" }}>Apple Watch Series 9</p>
                </div>
              </div>
              <Button size="xl" className="w-full" style={{ background: "#2563eb", color: "white", fontSize: 18, borderRadius: 12 }}>
                Connect
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold" style={{ color: "#1e293b" }}>Emergency Contacts</h2>
              {contacts.map((contact, i) => (
                <div key={i} className="space-y-3 p-4 rounded-xl" style={{ background: "#f8fafc" }}>
                  <Label className="text-base font-medium">Contact {i + 1}</Label>
                  <Input placeholder="Name" value={contact.name}
                    onChange={(e) => { const u = [...contacts]; u[i].name = e.target.value; setContacts(u); }}
                    style={{ fontSize: 18, height: 52, borderRadius: 10 }} />
                  <Input placeholder="Phone number" type="tel" value={contact.phone}
                    onChange={(e) => { const u = [...contacts]; u[i].phone = e.target.value; setContacts(u); }}
                    style={{ fontSize: 18, height: 52, borderRadius: 10 }} />
                </div>
              ))}
              <Button variant="outline" className="w-full" style={{ borderRadius: 10 }}
                onClick={() => setContacts([...contacts, { name: "", phone: "" }])}>
                + Add Contact
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold" style={{ color: "#1e293b" }}>Health Profile</h2>
              <div className="space-y-3">
                <Label className="text-base font-medium">Age</Label>
                <Input placeholder="Age" type="number" style={{ fontSize: 18, height: 52, borderRadius: 10 }} />
              </div>
              <div className="space-y-3">
                <Label className="text-base font-medium">Conditions</Label>
                <div className="grid grid-cols-2 gap-3">
                  {conditions.map((c) => (
                    <button key={c} onClick={() => setSelectedConditions(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])}
                      className="p-4 rounded-xl text-left font-medium" style={{
                        border: selectedConditions.includes(c) ? "2px solid #2563eb" : "2px solid #e2e8f0",
                        background: selectedConditions.includes(c) ? "#eff6ff" : "white",
                        color: selectedConditions.includes(c) ? "#1d4ed8" : "#475569", fontSize: 16,
                      }}>{c}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep(step - 1)}
            style={{ fontSize: 18, borderRadius: 12, height: 52 }}>
            <ArrowLeft className="w-5 h-5 mr-2" /> Back
          </Button>
        )}
        <Button size="lg" className="flex-1" onClick={() => { if (step < 2) setStep(step + 1); }}
          style={{ background: "#2563eb", color: "white", fontSize: 18, borderRadius: 12, height: 52 }}>
          {step === 2 ? "Done" : "Next"} <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
