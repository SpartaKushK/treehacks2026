"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Users, Watch, Type, User, Pencil, Plus, CheckCircle, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const [notifs, setNotifs] = useState({ alerts: true, appts: true, weekly: false });
  const [contacts, setContacts] = useState([
    { name: "Sarah Johnson", phone: "(555) 123-4567", relation: "Daughter" },
    { name: "Michael Johnson", phone: "(555) 987-6543", relation: "Son" },
  ]);
  const [fontSize, setFontSize] = useState(1);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>Settings</h1>

      {/* Profile */}
      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold" style={{ background: "#dbeafe", color: "#2563eb" }}>P</div>
            <div>
              <p className="text-xl font-bold" style={{ color: "#1e293b" }}>Pari</p>
              <p className="text-sm" style={{ color: "#64748b" }}>Age 72</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-6">
          <h2 className="font-bold mb-4 flex items-center gap-2" style={{ color: "#1e293b" }}><Bell className="w-5 h-5" style={{ color: "#d97706" }} /> Notifications</h2>
          <div className="space-y-4">
            {[
              { key: "alerts" as const, title: "Health Alerts" },
              { key: "appts" as const, title: "Appointment Reminders" },
              { key: "weekly" as const, title: "Weekly Summary" },
            ].map((n, i) => (
              <div key={n.key}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="flex items-center justify-between">
                  <p className="font-medium" style={{ color: "#1e293b" }}>{n.title}</p>
                  <Switch checked={notifs[n.key]} onCheckedChange={(v) => setNotifs({ ...notifs, [n.key]: v })} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contacts */}
      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold flex items-center gap-2" style={{ color: "#1e293b" }}><Users className="w-5 h-5" style={{ color: "#16a34a" }} /> Emergency Contacts</h2>
            <Button variant="outline" size="sm" onClick={() => setContacts([...contacts, { name: "", phone: "", relation: "" }])} style={{ borderRadius: 8 }}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
          <div className="space-y-3">
            {contacts.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#f8fafc" }}>
                <div>
                  <p className="font-medium" style={{ color: "#1e293b" }}>{c.name || "New Contact"}</p>
                  <p className="text-sm" style={{ color: "#64748b" }}>{c.phone || "—"} {c.relation && `· ${c.relation}`}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setContacts(contacts.filter((_, j) => j !== i))}>
                  <Trash2 className="w-4 h-4" style={{ color: "#f87171" }} />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Device */}
      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-6">
          <h2 className="font-bold mb-4 flex items-center gap-2" style={{ color: "#1e293b" }}><Watch className="w-5 h-5" style={{ color: "#8b5cf6" }} /> Device</h2>
          <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#f8fafc" }}>
            <div>
              <p className="font-medium" style={{ color: "#1e293b" }}>Apple Watch Series 9</p>
              <p className="text-sm" style={{ color: "#64748b" }}>Last sync: 2 min ago</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1" style={{ background: "#dcfce7", color: "#166534" }}>
              <CheckCircle className="w-3 h-3" /> Connected
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Font Size */}
      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-6">
          <h2 className="font-bold mb-4 flex items-center gap-2" style={{ color: "#1e293b" }}><Type className="w-5 h-5" style={{ color: "#2563eb" }} /> Text Size</h2>
          <div className="flex gap-3">
            {[{ label: "A", size: "S", value: 0, fs: "1rem" }, { label: "A", size: "M", value: 1, fs: "1.5rem" }, { label: "A", size: "L", value: 2, fs: "2rem" }].map((o) => (
              <button key={o.value} onClick={() => setFontSize(o.value)} className="flex-1 p-4 rounded-xl text-center"
                style={{ border: fontSize === o.value ? "2px solid #2563eb" : "2px solid #e2e8f0", background: fontSize === o.value ? "#eff6ff" : "white" }}>
                <span className="block font-bold" style={{ color: "#1e293b", fontSize: o.fs }}>{o.label}</span>
                <span className="text-sm" style={{ color: "#64748b" }}>{o.size}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button size="xl" className="w-full" style={{ background: "#2563eb", color: "white", fontSize: 18, borderRadius: 14, height: 56 }}>
        Save
      </Button>
    </div>
  );
}
