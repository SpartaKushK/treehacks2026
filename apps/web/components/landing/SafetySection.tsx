"use client";

import { motion } from "framer-motion";
import { Lock, Eye, FileCheck, Phone, LucideIcon } from "lucide-react";

interface SafetyFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const safetyFeatures: SafetyFeature[] = [
  {
    icon: Lock,
    title: "Encrypted Data",
    description:
      "All your health information is encrypted using the same technology banks use.",
  },
  {
    icon: Eye,
    title: "You Control Access",
    description:
      "Decide exactly who can see your information \u2014 doctors, family, or no one.",
  },
  {
    icon: FileCheck,
    title: "HIPAA Compliant",
    description:
      "We follow all healthcare privacy laws to keep your data safe.",
  },
  {
    icon: Phone,
    title: "24/7 Support",
    description:
      "Real humans available by phone whenever you need help. No robots.",
  },
];

export default function SafetySection() {
  return (
    <section
      id="safety"
      className="py-20 bg-teal-light"
      aria-labelledby="safety-heading"
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <motion.h2
            id="safety-heading"
            className="font-display text-3xl md:text-4xl font-bold text-charcoal mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Your Safety is{" "}
            <span className="text-teal">Our Priority</span>
          </motion.h2>
          <motion.p
            className="text-xl text-charcoal-light max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            We take extra care to make sure your information is private and
            secure.
          </motion.p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {safetyFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="bg-white rounded-3xl p-8 text-center shadow-md border-2 border-white hover:border-teal hover:shadow-lg transition-all"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
            >
              <div className="w-16 h-16 rounded-full bg-teal-light mx-auto mb-5 flex items-center justify-center">
                <feature.icon
                  className="w-8 h-8 text-teal"
                  strokeWidth={2}
                />
              </div>
              <h3 className="font-display text-xl font-bold text-charcoal mb-3">
                {feature.title}
              </h3>
              <p className="text-lg text-charcoal-light leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
