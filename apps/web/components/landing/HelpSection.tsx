"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Phone, Mail, MessageCircle } from "lucide-react";

const faqs = [
  {
    question: "What is CareSync?",
    answer:
      "CareSync is a service that gives you your own personal AI health assistant. It helps you keep track of your health, schedule doctor appointments, and keeps your family informed about your well-being \u2014 all in a simple, easy-to-use way.",
  },
  {
    question: "Is this safe to use?",
    answer:
      "Absolutely. We use the same security that banks use to protect your information. Only people you specifically approve can see your health data. We follow all healthcare privacy laws (HIPAA).",
  },
  {
    question: "Do I need to be good with computers?",
    answer:
      "Not at all! We designed this specifically to be easy to use. The text is large, the buttons are clear, and a family member or caregiver can help you set it up. Once it's running, it mostly works on its own.",
  },
  {
    question: 'What does "Agent" mean?',
    answer:
      'An "agent" is just a helpful AI assistant that works for you. Think of it like a personal secretary for your health \u2014 it remembers your appointments, watches for health changes, and sends you reminders.',
  },
  {
    question: "Can my family see my information?",
    answer:
      "Only if you want them to. You choose exactly what information to share and with whom. You can give your children access to appointment schedules while keeping medical details private, for example.",
  },
  {
    question: "How much does it cost?",
    answer:
      "Getting started is completely free. We believe everyone deserves access to health monitoring tools. Premium features are available for families who want additional capabilities.",
  },
];

function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-2 border-cream-dark rounded-2xl overflow-hidden bg-white">
      <button
        className="w-full flex items-center justify-between p-6 text-left hover:bg-cream transition-colors min-h-[64px]"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="font-display text-xl font-bold text-charcoal pr-4">
          {question}
        </span>
        <ChevronDown
          className={`w-7 h-7 text-teal shrink-0 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6">
              <p className="text-lg text-charcoal-light leading-relaxed">
                {answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HelpSection() {
  return (
    <section
      id="help"
      className="py-20 bg-warm-white"
      aria-labelledby="help-heading"
    >
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-16">
          <motion.h2
            id="help-heading"
            className="font-display text-3xl md:text-4xl font-bold text-charcoal mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Frequently Asked{" "}
            <span className="text-teal">Questions</span>
          </motion.h2>
          <motion.p
            className="text-xl text-charcoal-light"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Have questions? We have clear, simple answers.
          </motion.p>
        </div>

        <motion.div
          className="space-y-4 mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          {faqs.map((faq) => (
            <FAQItem key={faq.question} {...faq} />
          ))}
        </motion.div>

        {/* Contact options */}
        <motion.div
          className="bg-cream rounded-3xl p-8 md:p-12 border-2 border-cream-dark"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="font-display text-2xl font-bold text-charcoal text-center mb-8">
            Still Need Help? We&apos;re Here for You.
          </h3>
          <div className="grid sm:grid-cols-3 gap-6">
            <a
              href="tel:1-800-555-0199"
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white hover:bg-teal-light transition-colors border-2 border-cream-dark hover:border-teal group"
            >
              <Phone className="w-10 h-10 text-teal group-hover:scale-110 transition-transform" />
              <span className="font-bold text-lg text-charcoal">Call Us</span>
              <span className="text-base text-charcoal-light">
                1-800-555-0199
              </span>
            </a>
            <a
              href="mailto:help@caresync.com"
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white hover:bg-coral-light transition-colors border-2 border-cream-dark hover:border-coral group"
            >
              <Mail className="w-10 h-10 text-coral group-hover:scale-110 transition-transform" />
              <span className="font-bold text-lg text-charcoal">Email Us</span>
              <span className="text-base text-charcoal-light">
                help@caresync.com
              </span>
            </a>
            <button
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white hover:bg-gold-light transition-colors border-2 border-cream-dark hover:border-gold group"
              aria-label="Open live chat"
            >
              <MessageCircle className="w-10 h-10 text-gold group-hover:scale-110 transition-transform" />
              <span className="font-bold text-lg text-charcoal">
                Live Chat
              </span>
              <span className="text-base text-charcoal-light">
                Available 24/7
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
