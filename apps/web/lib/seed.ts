import { PrismaClient } from "@prisma/client";
import nacl from "tweetnacl";
import { setPrivateKey } from "./store";
import { toHex } from "./crypto";

const prisma = new PrismaClient();

export async function seed() {
  console.log("Seeding database...");

  // Clean existing data
  await prisma.trace.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.healthMetric.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.capability.deleteMany();
  await prisma.human.deleteMany();

  // Generate deterministic keypairs from handle (survive restarts)
  const pariKp = nacl.sign.keyPair.fromSeed(
    new TextEncoder().encode("pari".padEnd(32, "\0"))
  );
  const alexKp = nacl.sign.keyPair.fromSeed(
    new TextEncoder().encode("alex".padEnd(32, "\0"))
  );
  const drSmithKp = nacl.sign.keyPair.fromSeed(
    new TextEncoder().encode("dr_smith".padEnd(32, "\0"))
  );

  // Store private keys in runtime
  setPrivateKey("pari", pariKp.secretKey);
  setPrivateKey("alex", alexKp.secretKey);
  setPrivateKey("dr_smith", drSmithKp.secretKey);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  // Create humans
  const pari = await prisma.human.create({
    data: {
      handle: "pari",
      displayName: "Pari",
      publicKey: toHex(pariKp.publicKey),
      endpointUrl: `${baseUrl}/api/u/pari`,
    },
  });

  const alex = await prisma.human.create({
    data: {
      handle: "alex",
      displayName: "Alex",
      publicKey: toHex(alexKp.publicKey),
      endpointUrl: `${baseUrl}/api/u/alex`,
    },
  });

  const drSmith = await prisma.human.create({
    data: {
      handle: "dr_smith",
      displayName: "Dr. Smith",
      publicKey: toHex(drSmithKp.publicKey),
      endpointUrl: `${baseUrl}/api/u/dr_smith`,
    },
  });

  // Capabilities for alex
  await prisma.capability.createMany({
    data: [
      {
        humanId: alex.id,
        name: "schedule_propose",
        description: "Propose meeting times",
      },
      {
        humanId: alex.id,
        name: "schedule_counter",
        description: "Counter-propose meeting times",
      },
      {
        humanId: alex.id,
        name: "schedule_confirm",
        description: "Confirm a meeting booking",
      },
      {
        humanId: alex.id,
        name: "execute_trade",
        description: "Execute a financial trade",
      },
    ],
  });

  // Capabilities for pari
  await prisma.capability.createMany({
    data: [
      {
        humanId: pari.id,
        name: "schedule_propose",
        description: "Propose meeting times",
      },
      {
        humanId: pari.id,
        name: "schedule_confirm",
        description: "Confirm a meeting booking",
      },
      {
        humanId: pari.id,
        name: "health_summary",
        description: "View health analytics summary",
      },
      {
        humanId: pari.id,
        name: "health.anomaly_alert",
        description: "Receive and triage a health anomaly alert from wearable data",
      },
    ],
  });

  // Capabilities for dr_smith
  await prisma.capability.createMany({
    data: [
      {
        humanId: drSmith.id,
        name: "triage.intake_and_schedule",
        description: "Run intake questions and schedule a clinic appointment",
      },
    ],
  });

  // Policies for alex
  await prisma.policy.createMany({
    data: [
      {
        humanId: alex.id,
        capabilityName: "schedule_propose",
        allowedCallersJson: JSON.stringify(["pari"]),
        requiredScopesJson: JSON.stringify([]),
      },
      {
        humanId: alex.id,
        capabilityName: "schedule_counter",
        allowedCallersJson: JSON.stringify(["pari"]),
        requiredScopesJson: JSON.stringify([]),
      },
      {
        humanId: alex.id,
        capabilityName: "schedule_confirm",
        allowedCallersJson: JSON.stringify(["pari"]),
        requiredScopesJson: JSON.stringify(["propose_meeting"]),
      },
      {
        humanId: alex.id,
        capabilityName: "execute_trade",
        allowedCallersJson: JSON.stringify([]),
        requiredScopesJson: JSON.stringify(["trade_exec"]),
      },
    ],
  });

  // Policies for pari
  await prisma.policy.createMany({
    data: [
      {
        humanId: pari.id,
        capabilityName: "health_summary",
        allowedCallersJson: JSON.stringify(["dr_smith"]),
        requiredScopesJson: JSON.stringify([]),
        paymentRequired: true,
        priceCents: 500,
      },
      {
        humanId: pari.id,
        capabilityName: "schedule_propose",
        allowedCallersJson: JSON.stringify(["*"]),
      },
      {
        humanId: pari.id,
        capabilityName: "schedule_confirm",
        allowedCallersJson: JSON.stringify(["*"]),
        requiredScopesJson: JSON.stringify(["propose_meeting"]),
      },
      {
        humanId: pari.id,
        capabilityName: "health.anomaly_alert",
        allowedCallersJson: JSON.stringify(["pari"]),
        requiredScopesJson: JSON.stringify(["health:write"]),
      },
    ],
  });

  // Policies for dr_smith
  await prisma.policy.createMany({
    data: [
      {
        humanId: drSmith.id,
        capabilityName: "triage.intake_and_schedule",
        allowedCallersJson: JSON.stringify(["pari"]),
        requiredScopesJson: JSON.stringify(["triage:write"]),
      },
    ],
  });

  // Alex's calendar: busy slots next week
  const nextMon = getNextMonday();
  await prisma.calendarEvent.createMany({
    data: [
      {
        humanId: alex.id,
        title: "Team standup",
        startTs: setTime(nextMon, 9, 0).toISOString(),
        endTs: setTime(nextMon, 9, 30).toISOString(),
      },
      {
        humanId: alex.id,
        title: "Lunch with team",
        startTs: setTime(nextMon, 12, 0).toISOString(),
        endTs: setTime(nextMon, 13, 0).toISOString(),
      },
      {
        humanId: alex.id,
        title: "Design review",
        startTs: setTime(addDays(nextMon, 1), 14, 0).toISOString(),
        endTs: setTime(addDays(nextMon, 1), 15, 30).toISOString(),
      },
      {
        humanId: alex.id,
        title: "1:1 with manager",
        startTs: setTime(addDays(nextMon, 2), 10, 0).toISOString(),
        endTs: setTime(addDays(nextMon, 2), 10, 30).toISOString(),
      },
    ],
  });

  // Pari's health metrics for last 30 days
  const today = new Date();
  const healthData = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayStr = date.toISOString().split("T")[0];

    // Generate realistic-ish data with some variance
    const baseSleep = 6.5 + Math.sin(i * 0.3) * 1.5;
    const baseSteps = 7000 + Math.sin(i * 0.5) * 3000;
    const adherence = Math.random() > 0.15; // 85% adherence
    const symptom = 3 + Math.sin(i * 0.7) * 2 + (i === 10 ? 4 : 0); // spike on day 10

    healthData.push({
      humanId: pari.id,
      date: dayStr,
      sleepHours: Math.round(Math.max(4, Math.min(9, baseSleep)) * 10) / 10,
      steps: Math.round(Math.max(2000, baseSteps)),
      medAdherence: adherence,
      symptomScore: Math.round(Math.max(1, Math.min(10, symptom)) * 10) / 10,
    });
  }
  await prisma.healthMetric.createMany({ data: healthData });

  console.log("Seed complete: pari, alex, dr_smith created with demo data.");
  return { pariKp, alexKp, drSmithKp };
}

/* ── Date helpers ── */

function getNextMonday(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = ((8 - day) % 7) || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function setTime(d: Date, h: number, m: number): Date {
  const r = new Date(d);
  r.setHours(h, m, 0, 0);
  return r;
}

// Run directly if called from CLI
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
