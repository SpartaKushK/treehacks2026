"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import type { RedFlag } from "@/lib/voice/types";

interface Props {
  redFlag: RedFlag;
  onDismiss: () => void;
}

export default function RedFlagAlert({ redFlag, onDismiss }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  const isCritical = redFlag.severity === "critical";

  return (
    <div
      className="animate-pulse"
      style={{
        position: "fixed",
        top: 80,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        width: "min(90vw, 500px)",
        background: isCritical ? "#991b1b" : "#92400e",
        color: "#fff",
        borderRadius: 14,
        padding: "1rem 1.25rem",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
      }}
    >
      <ShieldAlert className="w-6 h-6 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-bold text-sm">
          {isCritical ? "CRITICAL" : "WARNING"}: {redFlag.flag}
        </p>
        <p className="text-xs mt-1" style={{ opacity: 0.85 }}>
          {redFlag.action}
        </p>
        {redFlag.triggerText && (
          <p className="text-xs mt-1" style={{ opacity: 0.7, fontStyle: "italic" }}>
            Patient said: &ldquo;{redFlag.triggerText}&rdquo;
          </p>
        )}
      </div>
      <button
        onClick={() => {
          setVisible(false);
          onDismiss();
        }}
        style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
