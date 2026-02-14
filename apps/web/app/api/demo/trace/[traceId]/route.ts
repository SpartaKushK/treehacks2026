import { NextRequest, NextResponse } from "next/server";
import { getTrace } from "@/lib/trace";
import { ensureSeed } from "@/lib/ensureSeed";

export async function GET(
  _req: NextRequest,
  { params }: { params: { traceId: string } }
) {
  await ensureSeed();

  const trace = await getTrace(params.traceId);
  if (!trace) {
    return NextResponse.json({ error: "trace_not_found" }, { status: 404 });
  }
  return NextResponse.json(trace);
}
