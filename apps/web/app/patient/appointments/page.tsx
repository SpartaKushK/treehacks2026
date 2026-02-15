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
    <div className="space-y-8" style={{ padding: "0.5rem" }}>
      <div style={{ textAlign: "center" }}>
        <h1 className="font-bold" style={{ color: "#0f172a", fontSize: "2rem", marginBottom: "0.5rem" }}>My Doctors</h1>
        <p style={{ color: "#64748b", fontSize: "1.125rem" }}>Your upcoming appointments</p>
      </div>

      {today.length > 0 && (
        <section>
          <h2 className="font-bold mb-4 flex items-center gap-3" style={{ color: "#1e293b", fontSize: "1.5rem" }}>
            <div className="w-3 h-3 rounded-full" style={{ background: "#22c55e" }} /> Today's Appointments
          </h2>
          <div className="space-y-4">{today.map(a => <ApptCard key={a.id} appt={a} />)}</div>
        </section>
      )}

      {today.length > 0 && upcoming.length > 0 && <Separator style={{ marginTop: "2rem", marginBottom: "2rem" }} />}

      {upcoming.length > 0 && (
        <section>
          <h2 className="font-bold mb-4 flex items-center gap-3" style={{ color: "#1e293b", fontSize: "1.5rem" }}>
            <Calendar className="w-6 h-6" style={{ color: "#2563eb" }} /> Coming Soon
          </h2>
          <div className="space-y-4">{upcoming.map(a => <ApptCard key={a.id} appt={a} />)}</div>
        </section>
      )}

      {appts.length === 0 && (
        <Card style={{ border: "3px dashed #cbd5e1", borderRadius: 20, marginTop: "3rem" }}>
          <CardContent className="p-16 text-center">
            <Calendar className="w-16 h-16 mx-auto mb-6" style={{ color: "#cbd5e1" }} />
            <p className="font-semibold" style={{ color: "#64748b", fontSize: "1.5rem" }}>No appointments scheduled</p>
            <p style={{ color: "#94a3b8", fontSize: "1rem", marginTop: "0.5rem" }}>You're all set for now</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ApptCard({ appt }: { appt: Appt }) {
  return (
    <Card style={{ border: appt.isToday ? "3px solid #86efac" : "3px solid #e2e8f0", borderRadius: 20, background: appt.isToday ? "#f0fdf4" : "white" }}>
      <CardContent className="p-7">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: appt.isToday ? "#bbf7d0" : "#dbeafe" }}>
              <User className="w-8 h-8" style={{ color: appt.isToday ? "#16a34a" : "#2563eb" }} />
            </div>
            <div>
              <p className="font-bold" style={{ color: "#1e293b", fontSize: "1.375rem" }}>{appt.doctor}</p>
              <p style={{ color: "#64748b", fontSize: "1.125rem", marginTop: "0.25rem" }}>{appt.specialty}</p>
              <div className="flex flex-col gap-2 mt-3">
                <span className="flex items-center gap-2" style={{ color: "#475569", fontSize: "1rem" }}><Calendar className="w-5 h-5" /> {appt.date}</span>
                <span className="flex items-center gap-2" style={{ color: "#475569", fontSize: "1rem" }}><Clock className="w-5 h-5" /> {appt.time}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <span className="px-4 py-2 rounded-full font-semibold" style={{
              background: appt.type === "telehealth" ? "#dcfce7" : "#dbeafe",
              color: appt.type === "telehealth" ? "#166534" : "#1e40af",
              fontSize: "0.9rem"
            }}>
              {appt.type === "telehealth" ? <span className="flex items-center gap-2"><Video className="w-4 h-4" /> Video Call</span> : <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> In Person</span>}
            </span>
            {appt.isToday && appt.type === "telehealth" && (
              <Button size="lg" style={{ background: "#16a34a", color: "white", borderRadius: 12, fontSize: "1rem", fontWeight: 600, padding: "0.75rem 1.5rem" }}>Join Call</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
