"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield,
  Activity,
  Calendar,
  Users,
  Heart,
  ArrowRight,
} from "lucide-react";

const features = [
  { icon: Activity, title: "Health Monitoring", desc: "Real-time anomaly detection from wearables" },
  { icon: Users, title: "Family Connected", desc: "Instant alerts and plain-English summaries" },
  { icon: Calendar, title: "Smart Scheduling", desc: "Agents negotiate and book appointments" },
];

export default function LandingPage() {
  return (
    <div className="landing-page h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b-2 border-cream-dark bg-warm-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3" aria-label="CareSync">
            <div className="w-10 h-10 rounded-xl bg-teal flex items-center justify-center shadow-md">
              <span className="text-white text-xl font-bold font-display">C</span>
            </div>
            <div>
              <span className="text-xl font-bold font-display text-teal">CareSync</span>
              <span className="block text-[10px] text-charcoal-light font-bold tracking-wide">ELDERLY CARE PLATFORM</span>
            </div>
          </a>
          <nav className="flex items-center gap-3">
            <Link href="/sign-in" className="px-5 py-2.5 rounded-xl text-base font-bold border-2 border-teal text-teal hover:bg-teal hover:text-white transition-colors">
              Sign In
            </Link>
            <Link href="/sign-up" className="px-5 py-2.5 rounded-xl text-base font-bold bg-coral text-white hover:bg-coral-dark transition-colors shadow-md">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Main — single screen */}
      <main className="flex-1 flex items-center relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0 opacity-30 pointer-events-none" aria-hidden="true">
          <div className="absolute top-0 left-0 w-96 h-96 bg-teal-light rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-coral-light rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — copy */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-light text-teal font-bold text-sm mb-5">
                <Shield className="w-4 h-4" />
                Safe &amp; Secure for Everyone
              </div>
              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal leading-tight mb-5">
                Your Personal
                <span className="text-teal block">Health Agent</span>
                <span className="text-coral">Made Simple</span>
              </h1>
              <p className="text-lg text-charcoal-light leading-relaxed mb-8 max-w-md">
                AI agents that monitor your well-being, schedule appointments, and keep your family informed.
              </p>
              <div className="flex gap-4">
                <Link href="/sign-up" className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl text-lg font-bold bg-coral text-white hover:bg-coral-dark transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                  Get Started Free <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="/patient" className="inline-flex items-center px-7 py-4 rounded-2xl text-lg font-bold border-2 border-cream-dark text-charcoal hover:border-teal hover:text-teal transition-colors">
                  Patient View
                </Link>
              </div>
            </motion.div>

            {/* Right — feature cards */}
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  className="flex items-start gap-4 p-5 rounded-2xl bg-white border-2 border-cream-dark shadow-sm hover:shadow-md transition-shadow"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                >
                  <div className="w-11 h-11 rounded-xl bg-teal-light flex items-center justify-center shrink-0">
                    <f.icon className="w-5 h-5 text-teal" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-charcoal">{f.title}</h3>
                    <p className="text-sm text-charcoal-light">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </main>

      {/* Footer — minimal */}
      <footer className="border-t-2 border-cream-dark bg-warm-white px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-charcoal-light">
          <span>&copy; 2026 CareSync</span>
          <span className="flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-coral fill-coral" /> at TreeHacks
          </span>
        </div>
      </footer>
    </div>
  );
}
