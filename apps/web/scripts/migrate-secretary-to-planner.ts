/**
 * Migration script: Copy "secretary" conversations to "planner" scope
 *
 * This script creates a copy of all existing "secretary" agent conversations
 * and converts them to "planner" conversations. The original "secretary"
 * conversations are preserved for rollback purposes.
 *
 * Usage:
 *   npx tsx scripts/migrate-secretary-to-planner.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 */

import { prisma } from "../lib/store";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof COLORS = "reset") {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  log("\n🔄 Secretary → Planner Migration Script", "bright");
  log("=" .repeat(60), "cyan");

  if (isDryRun) {
    log("\n⚠️  DRY RUN MODE - No changes will be made", "yellow");
  }

  // 1. Find all secretary conversations
  log("\n1. Finding secretary conversations...", "blue");
  const secretaryConversations = await prisma.agentConversation.findMany({
    where: { agentType: "secretary" },
    include: { messages: true },
    orderBy: { createdAt: "asc" },
  });

  log(
    `   Found ${secretaryConversations.length} secretary conversations`,
    "cyan",
  );

  if (secretaryConversations.length === 0) {
    log("\n✅ No secretary conversations to migrate", "green");
    return;
  }

  // 2. Check for existing planner conversations
  log("\n2. Checking for existing planner conversations...", "blue");
  const existingPlannerConversations = await prisma.agentConversation.findMany({
    where: { agentType: "planner" },
  });

  log(
    `   Found ${existingPlannerConversations.length} existing planner conversations`,
    "cyan",
  );

  const existingPlannerUsers = new Set(
    existingPlannerConversations.map((c) => c.userHandle),
  );

  // 3. Prepare migration
  log("\n3. Preparing migration...", "blue");

  const toMigrate = secretaryConversations.filter(
    (conv) => !existingPlannerUsers.has(conv.userHandle),
  );
  const toSkip = secretaryConversations.filter((conv) =>
    existingPlannerUsers.has(conv.userHandle),
  );

  log(`   Will migrate: ${toMigrate.length} conversations`, "green");
  log(`   Will skip (already exists): ${toSkip.length} conversations`, "yellow");

  if (toSkip.length > 0) {
    log("\n   Skipping users with existing planner conversations:", "yellow");
    toSkip.forEach((conv) => {
      console.log(`     - ${conv.userHandle}`);
    });
  }

  // 4. Migrate conversations
  if (toMigrate.length > 0 && !isDryRun) {
    log("\n4. Migrating conversations...", "blue");

    for (const conv of toMigrate) {
      try {
        // Create new planner conversation
        const newConversation = await prisma.agentConversation.create({
          data: {
            agentType: "planner",
            userHandle: conv.userHandle,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
          },
        });

        // Copy all messages
        for (const msg of conv.messages) {
          await prisma.agentMessage.create({
            data: {
              conversationId: newConversation.id,
              role: msg.role,
              content: msg.content,
              metadataJson: msg.metadataJson,
              createdAt: msg.createdAt,
            },
          });
        }

        log(
          `   ✅ Migrated: ${conv.userHandle} (${conv.messages.length} messages)`,
          "green",
        );
      } catch (err) {
        log(`   ❌ Failed: ${conv.userHandle} - ${err}`, "red");
      }
    }

    log("\n✅ Migration completed!", "green");
  } else if (isDryRun) {
    log("\n4. Would migrate (DRY RUN):", "yellow");
    toMigrate.forEach((conv) => {
      console.log(
        `   - ${conv.userHandle}: ${conv.messages.length} messages`,
      );
    });
  }

  // 5. Summary
  log("\n" + "=".repeat(60), "cyan");
  log("Migration Summary:", "bright");
  log("=".repeat(60), "cyan");
  console.log(`  Total secretary conversations: ${secretaryConversations.length}`);
  console.log(`  Migrated to planner: ${isDryRun ? toMigrate.length : toMigrate.length}`);
  console.log(`  Skipped (already exist): ${toSkip.length}`);
  console.log(`  Original secretary conversations: PRESERVED`);
  log("=".repeat(60) + "\n", "cyan");

  if (isDryRun) {
    log("💡 Run without --dry-run to perform the migration", "blue");
  } else {
    log("✨ Done! Original secretary conversations are preserved for rollback.", "green");
  }
}

main()
  .catch((err) => {
    log(`\n💥 Migration failed: ${err}`, "red");
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
