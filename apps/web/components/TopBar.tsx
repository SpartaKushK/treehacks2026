"use client";

import { UserButton } from "@clerk/nextjs";

interface Props {
  title: string;
}

export default function TopBar({ title }: Props) {
  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      <UserButton
        afterSignOutUrl="/"
        appearance={{
          elements: {
            avatarBox: { width: 32, height: 32 },
          },
        }}
      />
    </header>
  );
}
