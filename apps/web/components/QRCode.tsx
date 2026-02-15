"use client";

import { useEffect, useRef } from "react";
import QRCodeLib from "qrcode";

interface Props {
  value: string;
  size?: number;
}

export default function QRCode({ value, size = 140 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#1e293b", light: "#00000000" },
      errorCorrectionLevel: "M",
    });
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}
    />
  );
}
