import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/patient(.*)",
  "/api/registry(.*)",
  "/api/u/(.*)",
  "/api/demo/(.*)",
  "/api/auth/webhook",
  "/api/google/callback",
  "/api/trigger",
  "/api/health-data",
  "/api/anomaly(.*)",
  "/api/evidence(.*)",
  "/api/calendar(.*)",
  "/api/voice(.*)",
  "/api/chat",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
