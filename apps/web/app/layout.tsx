import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareSync — AI-Powered Elderly Care That Keeps Families Connected",
  description: "Intelligent health monitoring, proactive alerts, and seamless care coordination for the people you love most.",
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
          colorPrimary: "#2563eb",
          colorBackground: "#ffffff",
          colorText: "#1e293b",
          colorInputBackground: "#f8fafc",
          colorInputText: "#1e293b",
        },
      }}
    >
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
