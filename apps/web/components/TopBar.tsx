"use client";

import { UserButton, SignOutButton } from "@clerk/nextjs";

interface Props {
  title: string;
}

export default function TopBar({ title }: Props) {
  return (
    <header className="topbar" style={{ padding: "1rem 1.5rem" }}>
      <h1 className="topbar-title" style={{ fontSize: "1.5rem" }}>{title}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <SignOutButton redirectUrl="/">
          <button className="btn btn-secondary" style={{ fontSize: "0.875rem", padding: "0.5rem 1rem", borderRadius: 10, minHeight: "40px" }}>
            Sign Out
          </button>
        </SignOutButton>
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: { width: 40, height: 40, border: "2px solid #F5EDE3", borderRadius: 12 },
            },
          }}
        />
      </div>
    </header>
  );
}
