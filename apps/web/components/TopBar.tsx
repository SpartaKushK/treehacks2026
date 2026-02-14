"use client";

import { UserButton, SignOutButton } from "@clerk/nextjs";

interface Props {
  title: string;
}

export default function TopBar({ title }: Props) {
  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <SignOutButton redirectUrl="/">
          <button className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.375rem 0.75rem" }}>
            Sign Out
          </button>
        </SignOutButton>
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: { width: 36, height: 36, border: "2px solid var(--border)" },
            },
          }}
        />
      </div>
    </header>
  );
}
