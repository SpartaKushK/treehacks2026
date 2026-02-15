import { Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-charcoal text-white py-16" role="contentinfo">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal flex items-center justify-center">
                <span className="text-white text-xl font-bold font-display">
                  C
                </span>
              </div>
              <span className="text-xl font-bold font-display">CareSync</span>
            </div>
            <p className="text-lg text-white/70 leading-relaxed">
              Agent-to-Agent Human Endpoints — making health technology
              accessible and simple for everyone.
            </p>
          </div>

          <div>
            <h3 className="font-display text-xl font-bold mb-4">
              Quick Links
            </h3>
            <nav aria-label="Footer navigation">
              <ul className="space-y-3">
                {[
                  { label: "Features", href: "#features" },
                  { label: "How It Works", href: "#how-it-works" },
                  { label: "Safety & Privacy", href: "#safety" },
                  { label: "Help & FAQ", href: "#help" },
                ].map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-lg text-white/70 hover:text-white transition-colors hover:underline underline-offset-4"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div>
            <h3 className="font-display text-xl font-bold mb-4">Contact Us</h3>
            <ul className="space-y-3 text-lg text-white/70">
              <li>
                <a
                  href="tel:1-800-555-0199"
                  className="hover:text-white transition-colors hover:underline underline-offset-4"
                >
                  1-800-555-0199
                </a>
              </li>
              <li>
                <a
                  href="mailto:help@caresync.com"
                  className="hover:text-white transition-colors hover:underline underline-offset-4"
                >
                  help@caresync.com
                </a>
              </li>
              <li>Available 24 hours a day, 7 days a week</li>
            </ul>
          </div>
        </div>

        <hr className="border-white/20 mb-8" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-base text-white/60">
          <p>
            &copy; {new Date().getFullYear()} CareSync. All rights reserved.
          </p>
          <p className="flex items-center gap-2">
            Made with{" "}
            <Heart className="w-4 h-4 text-coral fill-coral" /> for everyone
          </p>
        </div>
      </div>
    </footer>
  );
}
