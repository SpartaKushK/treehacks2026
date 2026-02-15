"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Heart } from "lucide-react";

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Safety", href: "#safety" },
    { label: "Help", href: "#help" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b-2 border-cream-dark shadow-sm bg-warm-white">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <a
          href="#"
          className="flex items-center gap-3 group"
          aria-label="CareSync - Home"
        >
          <div className="w-12 h-12 rounded-2xl bg-teal flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
            <span className="text-white text-2xl font-bold font-display">
              C
            </span>
          </div>
          <div>
            <span className="text-2xl font-bold font-display text-teal">
              CareSync
            </span>
            <span className="block text-xs text-charcoal-light font-bold tracking-wide">
              ELDERLY CARE PLATFORM
            </span>
          </div>
        </a>

        {/* Desktop nav */}
        <nav
          className="hidden lg:flex items-center gap-2"
          aria-label="Main navigation"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-5 py-3 rounded-xl text-lg font-bold transition-colors min-h-[48px] flex items-center text-charcoal hover:bg-teal-light hover:text-teal"
            >
              {link.label}
            </a>
          ))}
          <div className="w-px h-8 bg-cream-dark mx-2" aria-hidden="true" />
          <Link
            href="/sign-in"
            className="px-6 py-3 rounded-xl text-lg font-bold border-2 border-teal text-teal hover:bg-teal hover:text-white transition-colors min-h-[48px] flex items-center"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="px-6 py-3 rounded-xl text-lg font-bold bg-coral text-white hover:bg-coral-dark transition-colors min-h-[48px] flex items-center shadow-md"
          >
            Create Account
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden p-3 rounded-xl bg-teal-light text-teal min-w-[48px] min-h-[48px] flex items-center justify-center"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <X className="w-7 h-7" />
          ) : (
            <Menu className="w-7 h-7" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:hidden overflow-hidden border-t-2 border-cream-dark"
            aria-label="Mobile navigation"
          >
            <div className="p-4 flex flex-col gap-2">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="px-5 py-4 rounded-xl text-xl font-bold text-charcoal hover:bg-teal-light hover:text-teal transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <hr className="border-cream-dark my-2" />
              <Link
                href="/sign-in"
                onClick={() => setMobileOpen(false)}
                className="px-5 py-4 rounded-xl text-xl font-bold text-center border-2 border-teal text-teal hover:bg-teal hover:text-white transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                onClick={() => setMobileOpen(false)}
                className="px-5 py-4 rounded-xl text-xl font-bold text-center bg-coral text-white hover:bg-coral-dark transition-colors shadow-md"
              >
                Create Account
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
