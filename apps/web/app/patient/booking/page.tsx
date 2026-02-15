"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Calendar, Clock, Video, User, ArrowRight } from "lucide-react";
import StreamingAvatar, { type StreamingAvatarHandle } from "@/components/StreamingAvatar";
import { DOCTOR_PROFILE } from "@/lib/avatarProfiles";

interface Booking { doctorName: string; specialty: string; date: string; time: string; reason: string; }

export default function BookingConfirmationPage() {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const avatarRef = useRef<StreamingAvatarHandle>(null);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch("/api/calendar/events?handle=pari");
        if (res.ok) {
          const json = await res.json();
          const event = json.events?.[0];
          if (event) {
            const start = new Date(event.startTs || event.start);
            setBooking({ doctorName: "Dr. Sarah Smith", specialty: "Family Doctor",
              date: start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
              time: start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
              reason: event.title || "Check-up" });
          } else { fallback(); }
        } else { fallback(); }
      } catch { fallback(); } finally { setLoading(false); }
    }
    function fallback() { setBooking({ doctorName: "Dr. Sarah Smith", specialty: "Family Doctor", date: "Monday, February 16", time: "10:30 AM", reason: "Heart Check-Up" }); }
    fetch_();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-12 h-12 rounded-full" style={{ border: "4px solid #bbf7d0", borderTopColor: "#16a34a", animation: "spin 0.6s linear infinite" }} /></div>;
  if (!booking) return null;

  return (
    <div style={{ maxWidth: 500, margin: "0 auto" }} className="space-y-6">
      <div className="flex items-center gap-3">
        <CheckCircle className="w-8 h-8" style={{ color: "#16a34a" }} />
        <h1 className="text-3xl font-bold" style={{ color: "#0f172a" }}>Appointment Booked</h1>
      </div>

      <Card style={{ border: "2px solid #bbf7d0", borderRadius: 16 }}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#dbeafe" }}>
              <User className="w-6 h-6" style={{ color: "#2563eb" }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: "#1e293b" }}>{booking.doctorName}</p>
              <p style={{ color: "#64748b" }}>{booking.specialty}</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5" style={{ color: "#2563eb" }} />
              <p className="font-semibold text-lg" style={{ color: "#1e293b" }}>{booking.date}</p>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5" style={{ color: "#2563eb" }} />
              <p className="font-semibold text-lg" style={{ color: "#1e293b" }}>{booking.time}</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Video className="w-5 h-5" style={{ color: "#16a34a" }} />
            <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ background: "#dcfce7", color: "#166534" }}>Video Call</span>
          </div>
          <div>
            <p className="text-sm" style={{ color: "#64748b" }}>Reason</p>
            <p className="font-medium" style={{ color: "#1e293b" }}>{booking.reason}</p>
          </div>
        </CardContent>
      </Card>

      <Card style={{ border: "2px solid #f1f5f9", borderRadius: 16 }}>
        <CardContent className="p-6 flex flex-col items-center">
          <h2 className="font-bold mb-4" style={{ color: "#1e293b" }}>{DOCTOR_PROFILE.name}</h2>
          <StreamingAvatar
            ref={avatarRef}
            avatarId={DOCTOR_PROFILE.avatarId}
            initialText={`Hello, I'm ${DOCTOR_PROFILE.name}. Your appointment for ${booking.reason} is confirmed for ${booking.date} at ${booking.time}. Please complete the pre-visit questions before our appointment so I can review your information ahead of time.`}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button size="xl" className="w-full" style={{ background: "#16a34a", color: "white", fontSize: 18, borderRadius: 14, height: 56 }}>
          Confirm
        </Button>
        <Button size="xl" variant="outline" style={{ fontSize: 18, borderRadius: 14, height: 56 }}>Reschedule</Button>
      </div>

      <Link href="/patient/triage">
        <Button variant="outline" size="lg" className="w-full" style={{ fontSize: 16, borderRadius: 12, height: 48 }}>
          Pre-Visit Questions <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </Link>
    </div>
  );
}
