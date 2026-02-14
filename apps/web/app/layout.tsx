import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
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
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#6366f1",
          colorBackground: "#12121a",
          colorText: "#e4e4ef",
          colorInputBackground: "#0a0a0f",
          colorInputText: "#e4e4ef",
        },
      }}
    >
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
