import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="landing">
      <div className="landing-content">
        <h1 className="landing-title">People API</h1>
        <p className="landing-subtitle">
          Agent-to-Agent Human Endpoints &mdash; each person has a canonical
          endpoint with scope-based permissions, signed requests, and
          intelligent health orchestration.
        </p>
        <div className="landing-features">
          <div className="landing-feature">
            <div className="landing-feature-icon">&#9673;</div>
            <h3>Agent Configuration</h3>
            <p>Create and configure AI agents with custom capabilities, policies, and persona prompts.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">&#9651;</div>
            <h3>Anomaly Detection</h3>
            <p>Real-time health monitoring with intelligent escalation to doctor agents.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">&#9638;</div>
            <h3>Calendar Integration</h3>
            <p>Google Calendar sync for scheduling appointments across agent boundaries.</p>
          </div>
        </div>
        <div className="landing-actions">
          <Link href="/sign-in" className="btn btn-primary" style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>
            Sign In
          </Link>
          <Link href="/sign-up" className="btn btn-secondary" style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
