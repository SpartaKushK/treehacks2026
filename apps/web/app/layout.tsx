import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "People API — Agent-to-Agent Human Endpoints",
  description: "TreeHacks 2026 — canonical agent endpoints for humans",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
