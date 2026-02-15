"use client";

import { motion } from "framer-motion";
import { UserPlus, Cpu, HeartPulse, CalendarCheck, LucideIcon } from "lucide-react";

interface Step {
  number: number;
  icon: LucideIcon;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    number: 1,
    icon: UserPlus,
    title: "Create Your Account",
    description:
      "Sign up with your name and email. A family member or caregiver can help you set it up. It takes less than 2 minutes.",
  },
  {
    number: 2,
    icon: Cpu,
    title: "Set Up Your Agent",
    description:
      "Your personal AI health agent is created automatically. Tell it about your medications, conditions, and preferences.",
  },
  {
    number: 3,
    icon: HeartPulse,
    title: "Health Monitoring Begins",
    description:
      "Your agent watches for anomalies and keeps track of your wellness. It learns your patterns and alerts you or your doctor when needed.",
  },
  {
    number: 4,
    icon: CalendarCheck,
    title: "Stay Connected",
    description:
      "Appointments are synced to your calendar, reminders come on time, and your family stays informed \u2014 all automatically.",
  },
];

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-20 bg-cream"
      aria-labelledby="how-it-works-heading"
    >
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-16">
          <motion.h2
            id="how-it-works-heading"
            className="font-display text-3xl md:text-4xl font-bold text-charcoal mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            How It Works —{" "}
            <span className="text-coral">Step by Step</span>
          </motion.h2>
          <motion.p
            className="text-xl text-charcoal-light max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Getting started is easy. Here&apos;s what happens when you join.
          </motion.p>
        </div>

        <div className="relative">
          {/* Connecting line */}
          <div
            className="hidden md:block absolute left-1/2 top-0 bottom-0 w-1 bg-teal-light -translate-x-1/2"
            aria-hidden="true"
          />

          <div className="space-y-12 md:space-y-16">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                className={`relative flex flex-col md:flex-row items-center gap-6 md:gap-12 ${
                  index % 2 === 1 ? "md:flex-row-reverse" : ""
                }`}
                initial={{ opacity: 0, x: index % 2 === 0 ? -40 : 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5 }}
              >
                {/* Number badge (on the line) */}
                <div
                  className="hidden md:flex absolute left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-teal text-white font-display font-bold text-2xl items-center justify-center shadow-lg z-10"
                  aria-hidden="true"
                >
                  {step.number}
                </div>

                {/* Card */}
                <div
                  className={`flex-1 ${
                    index % 2 === 0 ? "md:text-right" : "md:text-left"
                  }`}
                >
                  <div className="bg-white rounded-3xl p-8 shadow-md border-2 border-cream-dark hover:shadow-lg transition-shadow">
                    <div
                      className={`flex items-center gap-4 mb-4 ${
                        index % 2 === 0 ? "md:flex-row-reverse" : ""
                      }`}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-teal-light flex items-center justify-center shrink-0">
                        <step.icon className="w-7 h-7 text-teal" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-coral uppercase tracking-wider">
                          Step {step.number}
                        </span>
                        <h3 className="font-display text-2xl font-bold text-charcoal">
                          {step.title}
                        </h3>
                      </div>
                    </div>
                    <p className="text-lg text-charcoal-light leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Spacer for the other side */}
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
