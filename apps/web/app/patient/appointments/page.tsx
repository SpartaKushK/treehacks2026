"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Calendar, Clock, User, Video, MapPin } from "lucide-react";

interface Appt { id: string; doctor: string; specialty: string; date: string; time: string; type: "telehealth" | "in_person"; isToday: boolean; }

export default function AppointmentsPage() {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/calendar/events?handle=pari");
        if (res.ok) {
          const json = await res.json();
          if (json.events?.length) {
            const names = ["Dr. Sarah Smith", "Dr. James Lee", "Dr. Maria Garcia"];
            const specs = ["Family Medicine", "Cardiology", "Internal Medicine"];
            setAppts(json.events.map((e: any, i: number) => {
              const start = new Date(e.startTs || e.start);
              return { id: String(i), doctor: names[i % 3], specialty: specs[i % 3],
                date: start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
                time: start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
                type: i % 2 === 0 ? "telehealth" as const : "in_person" as const,
                isToday: start.toDateString() === new Date().toDateString() };
            }));
          } else { fallback(); }
        } else { fallback(); }
      } catch { fallback(); } finally { setLoading(false); }
    }
    function fallback() {
      setAppts([
        { id: "1", doctor: "Dr. Sarah Smith", specialty: "Family Medicine", date: "Mon, Feb 16", time: "10:30 AM", type: "telehealth", isToday: true },
        { id: "2", doctor: "Dr. James Lee", specialty: "Cardiology", date: "Wed, Feb 18", time: "2:00 PM", type: "in_person", isToday: false },
        { id: "3", doctor: "Dr. Maria Garcia", specialty: "Internal Medicine", date: "Fri, Feb 27", time: "9:00 AM", type: "telehealth", isToday: false },
      ]);
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 rounded-full" style={{ border: "4px solid #bfdbfe", borderTopColor: "#2563eb", animation: "spin 0.6s linear infinite" }} /></div>;

  const today = appts.filter(a => a.isToday);
  const upcoming = appts.filter(a => !a.isToday);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>Appointments</h1>

      {today.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "#1e293b" }}>
            <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} /> Today
          </h2>
          <div className="space-y-3">{today.map(a => <ApptCard key={a.id} appt={a} />)}</div>
        </section>
      )}

      {today.length > 0 && upcoming.length > 0 && <Separator />}

      {upcoming.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: "#1e293b" }}>
            <Calendar className="w-5 h-5" style={{ color: "#2563eb" }} /> Upcoming
          </h2>
          <div className="space-y-3">{upcoming.map(a => <ApptCard key={a.id} appt={a} />)}</div>
        </section>
      )}

      {appts.length === 0 && (
        <Card style={{ border: "2px dashed #e2e8f0", borderRadius: 16 }}>
          <CardContent className="p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-4" style={{ color: "#cbd5e1" }} />
            <p className="text-xl font-medium" style={{ color: "#64748b" }}>No appointments</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ApptCard({ appt }: { appt: Appt }) {
  return (
    <Card style={{ border: appt.isToday ? "2px solid #bbf7d0" : "2px solid #f1f5f9", borderRadius: 16 }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: appt.isToday ? "#dcfce7" : "#dbeafe" }}>
              <User className="w-6 h-6" style={{ color: appt.isToday ? "#16a34a" : "#2563eb" }} />
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: "#1e293b" }}>{appt.doctor}</p>
              <p className="text-sm" style={{ color: "#64748b" }}>{appt.specialty}</p>
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1 text-sm" style={{ color: "#475569" }}><Calendar className="w-4 h-4" /> {appt.date}</span>
                <span className="flex items-center gap-1 text-sm" style={{ color: "#475569" }}><Clock className="w-4 h-4" /> {appt.time}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-medium" style={{
              background: appt.type === "telehealth" ? "#dcfce7" : "#dbeafe",
              color: appt.type === "telehealth" ? "#166534" : "#1e40af"
            }}>
              {appt.type === "telehealth" ? "Video" : "In Person"}
            </span>
            {appt.isToday && appt.type === "telehealth" && (
              <Button size="sm" style={{ background: "#16a34a", color: "white", borderRadius: 8 }}>Join</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
