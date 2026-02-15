"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Heart } from "lucide-react";

export default function CTASection() {
  return (
    <section
      id="create-account"
      className="py-20 bg-teal relative overflow-hidden"
      aria-labelledby="cta-heading"
    >
      {/* Decorative elements */}
      <div className="absolute inset-0 opacity-10" aria-hidden="true">
        <div className="absolute top-10 left-10 w-40 h-40 rounded-full border-4 border-white" />
        <div className="absolute bottom-10 right-10 w-60 h-60 rounded-full border-4 border-white" />
        <div className="absolute top-1/2 left-1/3 w-20 h-20 rounded-full border-4 border-white" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Heart className="w-16 h-16 text-white mx-auto mb-6 fill-white/30" />
          <h2
            id="cta-heading"
            className="font-display text-3xl md:text-5xl font-bold text-white mb-6 leading-tight"
          >
            Ready to Take Control
            <br />
            of Your Health?
          </h2>
          <p className="text-xl md:text-2xl text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed">
            Join thousands of people who trust CareSync to help them stay
            healthy, connected, and informed. Getting started takes just 2
            minutes.
          </p>

          <div className="flex flex-col sm:flex-row gap-5 justify-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-3 px-10 py-5 rounded-2xl text-xl font-bold bg-white text-teal hover:bg-cream transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 min-h-[60px]"
            >
              Create Free Account
              <ArrowRight className="w-6 h-6" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center px-10 py-5 rounded-2xl text-xl font-bold border-3 border-white text-white hover:bg-white hover:text-teal transition-all min-h-[60px]"
            >
              Sign In
            </Link>
          </div>

          <p className="mt-8 text-lg text-white/80">
            Free forever for basic features · No credit card needed
          </p>
        </motion.div>
      </div>
    </section>
  );
}
