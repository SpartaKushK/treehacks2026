"use client";

import { motion } from "framer-motion";
import {
  Settings,
  Activity,
  Calendar,
  Shield,
  Users,
  Bell,
  LucideIcon,
} from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  bgColor: string;
  textColor: string;
  symbol: string;
}

const features: Feature[] = [
  {
    icon: Settings,
    title: "Agent Configuration",
    description:
      "Create and configure AI agents with custom capabilities, policies, and persona prompts. Set up your personal health assistant in minutes.",
    bgColor: "bg-teal-light",
    textColor: "text-teal",
    symbol: "\u25C9",
  },
  {
    icon: Activity,
    title: "Anomaly Detection",
    description:
      "Real-time health monitoring with intelligent escalation to doctor agents. Get alerts when something needs attention \u2014 peace of mind for you and your family.",
    bgColor: "bg-coral-light",
    textColor: "text-coral",
    symbol: "\u25B3",
  },
  {
    icon: Calendar,
    title: "Calendar Integration",
    description:
      "Google Calendar sync for scheduling appointments across agent boundaries. Never miss a doctor's visit or medication reminder again.",
    bgColor: "bg-navy-light",
    textColor: "text-navy",
    symbol: "\u25A6",
  },
  {
    icon: Shield,
    title: "Privacy & Security",
    description:
      "Your health data is protected with enterprise-grade encryption. Scope-based permissions mean you control exactly who sees what.",
    bgColor: "bg-sage-light",
    textColor: "text-sage",
    symbol: "\uD83D\uDEE1",
  },
  {
    icon: Users,
    title: "Family Dashboard",
    description:
      "Caregivers and family members can stay connected with shared dashboards. See health summaries without compromising privacy.",
    bgColor: "bg-gold-light",
    textColor: "text-gold",
    symbol: "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67",
  },
  {
    icon: Bell,
    title: "Smart Reminders",
    description:
      "Medication reminders, appointment alerts, and wellness check-ins delivered the way you prefer \u2014 phone, text, or screen.",
    bgColor: "bg-coral-light",
    textColor: "text-coral",
    symbol: "\uD83D\uDD14",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function FeaturesSection() {
  return (
    <section
      id="features"
      className="py-20 bg-warm-white"
      aria-labelledby="features-heading"
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <motion.h2
            id="features-heading"
            className="font-display text-3xl md:text-4xl font-bold text-charcoal mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Everything You Need,{" "}
            <span className="text-teal">Nothing You Don&apos;t</span>
          </motion.h2>
          <motion.p
            className="text-xl text-charcoal-light max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Simple, powerful features designed with clarity and ease of use in
            mind.
          </motion.p>
        </div>

        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {features.map((feature) => (
            <motion.article
              key={feature.title}
              variants={cardVariants}
              className="relative p-8 rounded-3xl bg-white border-2 border-cream-dark hover:border-current hover:shadow-xl transition-all group cursor-default"
              role="article"
              aria-label={feature.title}
            >
              <div
                className={`w-16 h-16 rounded-2xl ${feature.bgColor} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}
              >
                <feature.icon
                  className={`w-8 h-8 ${feature.textColor}`}
                  strokeWidth={2}
                />
              </div>
              <h3 className="font-display text-2xl font-bold text-charcoal mb-3">
                {feature.title}
              </h3>
              <p className="text-lg text-charcoal-light leading-relaxed">
                {feature.description}
              </p>
              <div
                className={`absolute top-6 right-6 text-3xl opacity-20 ${feature.textColor}`}
                aria-hidden="true"
              >
                {feature.symbol}
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
