import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * Test endpoint to verify Supabase connection and see what tables exist
 * GET /api/test-supabase
 */
export async function GET(req: NextRequest) {
  // First check if environment variables are set
  const hasSupabaseUrl = !!process.env.SUPABASE_URL;
  const hasSupabaseKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasDatabaseUrl = !!process.env.DATABASE_URL;

  if (!hasSupabaseUrl || !hasSupabaseKey) {
    return NextResponse.json({
      status: "error",
      message: "Supabase environment variables not configured",
      env: {
        SUPABASE_URL: hasSupabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: hasSupabaseKey,
        DATABASE_URL: hasDatabaseUrl,
      },
    }, { status: 500 });
  }

  try {
    const supabase = getSupabase();

    // Try a simple query on the Human table
    const { data: humans, error: humansError } = await supabase
      .from("Human")
      .select("handle, displayName")
      .limit(5);

    if (humansError) {
      return NextResponse.json({
        status: "error",
        message: "Supabase query failed",
        error: humansError.message,
        details: humansError,
        env: {
          SUPABASE_URL: process.env.SUPABASE_URL,
          DATABASE_URL_SET: hasDatabaseUrl,
        },
      }, { status: 500 });
    }

    return NextResponse.json({
      status: "connected",
      message: "Supabase connection successful!",
      humanCount: humans?.length || 0,
      humans: humans || [],
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL,
        DATABASE_URL_SET: hasDatabaseUrl,
      },
    });
  } catch (err) {
    console.error("Test error:", err);
    return NextResponse.json({
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}
