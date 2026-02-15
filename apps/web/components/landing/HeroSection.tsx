"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Shield, ArrowDown } from "lucide-react";

export default function HeroSection() {
  return (
    <section
      className="relative overflow-hidden py-16 md:py-24"
      aria-labelledby="hero-heading"
    >
      {/* Soft background pattern */}
      <div className="absolute inset-0 opacity-30" aria-hidden="true">
        <div className="absolute top-0 left-0 w-96 h-96 bg-teal-light rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-coral-light rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-gold-light rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-light text-teal font-bold text-base mb-6">
              <Shield className="w-5 h-5" />
              Safe & Secure for Everyone
            </div>

            <h1
              id="hero-heading"
              className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-charcoal leading-tight mb-6"
            >
              Your Personal
              <span className="text-teal block">Health Agent</span>
              <span className="text-coral">Made Simple</span>
            </h1>

            <p className="text-xl md:text-2xl text-charcoal-light leading-relaxed mb-8 max-w-lg">
              Each person gets their own{" "}
              <strong>secure health endpoint</strong> — AI agents that monitor
              your well-being, schedule appointments, and keep your family
              informed.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center px-8 py-5 rounded-2xl text-xl font-bold bg-coral text-white hover:bg-coral-dark transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 min-h-[56px]"
              >
                Get Started — It&apos;s Free
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center px-8 py-5 rounded-2xl text-xl font-bold border-3 border-teal text-teal hover:bg-teal hover:text-white transition-all min-h-[56px]"
              >
                Learn How It Works
              </a>
            </div>

            <p className="mt-6 text-base text-charcoal-light flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal" />
              No credit card required · HIPAA compliant · Family-friendly
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="hidden lg:block"
          >
            <div className="rounded-3xl overflow-hidden shadow-2xl border-4 border-cream-dark">
              <img
                src="/images/hero-illustration.png"
                alt="Illustration showing connected people in a friendly health network"
                className="w-full h-auto"
                loading="eager"
              />
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="flex justify-center mt-12"
        >
          <a
            href="#features"
            className="flex flex-col items-center gap-2 text-teal hover:text-teal-dark transition-colors group"
            aria-label="Scroll down to features"
          >
            <span className="text-base font-bold">See What We Offer</span>
            <ArrowDown className="w-6 h-6 animate-bounce" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
