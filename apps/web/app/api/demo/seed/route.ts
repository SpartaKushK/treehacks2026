import { NextResponse } from "next/server";
import { seed } from "@/lib/seed";

export async function POST() {
  await seed();
  return NextResponse.json({ ok: true, message: "Database seeded." });
}
