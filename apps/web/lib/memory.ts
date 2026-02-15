/**
 * Agent Memory Service
 *
 * Provides per-user, per-agent persistent conversation history.
 * Each agent (secretary, health_anomaly, triage, scheduler) maintains
 * its own separate conversation thread for each user.
 *
 * Stored in the database via Prisma (AgentConversation + AgentMessage).
 */

import { prisma } from "./store";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Supported agent types — each gets its own conversation per user */
export type AgentType = "secretary" | "health_anomaly" | "triage" | "scheduler" | "chat" | "health_review";

export interface MemoryMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Core CRUD                                                          */
/* ------------------------------------------------------------------ */

/**
 * Get or create a conversation for a specific agent + user pair.
 * Returns the conversation ID.
 */
export async function getOrCreateConversation(
  agentType: AgentType,
  userHandle: string,
): Promise<string> {
  const existing = await prisma.agentConversation.findUnique({
    where: {
      agentType_userHandle: {
        agentType,
        userHandle,
      },
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await prisma.agentConversation.create({
    data: {
      agentType,
      userHandle,
    },
  });

  return created.id;
}

/**
 * Append a message to a conversation.
 */
export async function addMessage(
  conversationId: string,
  message: MemoryMessage,
): Promise<void> {
  await prisma.agentMessage.create({
    data: {
      conversationId,
      role: message.role,
      content: message.content,
      metadataJson: JSON.stringify(message.metadata || {}),
    },
  });

  // Touch the conversation's updatedAt
  await prisma.agentConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}

/**
 * Get the full message history for a conversation.
 * Ordered by creation time (oldest first).
 */
export async function getHistory(
  agentType: AgentType,
  userHandle: string,
): Promise<MemoryMessage[]> {
  const convo = await prisma.agentConversation.findUnique({
    where: {
      agentType_userHandle: {
        agentType,
        userHandle,
      },
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!convo) return [];

  return convo.messages.map((m) => ({
    role: m.role as MemoryMessage["role"],
    content: m.content,
    metadata: JSON.parse(m.metadataJson),
  }));
}

/**
 * Format conversation history into the OpenAI / Anthropic message format
 * for injection into an LLM call. Only includes "user" and "assistant"
 * role messages (tool_call / tool_result are condensed into assistant context).
 *
 * Returns an array of { role, content } objects ready for the messages array.
 */
export function formatHistoryForLLM(
  history: MemoryMessage[],
  maxMessages: number = 50,
): Array<{ role: "user" | "assistant"; content: string }> {
  const formatted: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of history) {
    if (msg.role === "user") {
      formatted.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      formatted.push({ role: "assistant", content: msg.content });
    } else if (msg.role === "tool_call") {
      // Condense tool calls into assistant context
      formatted.push({
        role: "assistant",
        content: `[Tool call: ${msg.content}]`,
      });
    } else if (msg.role === "tool_result") {
      // Condense tool results into user-side context
      formatted.push({
        role: "user",
        content: `[Tool result: ${msg.content}]`,
      });
    }
  }

  // Trim to last N messages if conversation is very long
  if (formatted.length > maxMessages) {
    const trimmed = formatted.slice(-maxMessages);
    // Prepend a system note about trimming
    trimmed.unshift({
      role: "user",
      content: `[Note: Earlier conversation history was trimmed. Showing last ${maxMessages} messages.]`,
    });
    return trimmed;
  }

  return formatted;
}

/**
 * Clear all messages for a conversation (e.g. flush chat history).
 * Leaves the conversation record so getOrCreateConversation still works.
 */
export async function clearConversation(
  agentType: AgentType,
  userHandle: string,
): Promise<void> {
  const convo = await prisma.agentConversation.findUnique({
    where: {
      agentType_userHandle: { agentType, userHandle },
    },
    select: { id: true },
  });
  if (!convo) return;
  await prisma.agentMessage.deleteMany({ where: { conversationId: convo.id } });
}

/**
 * Convenience: save a full interaction (user trigger + assistant decision)
 * to a specific agent's memory in one call.
 */
export async function saveInteraction(
  agentType: AgentType,
  userHandle: string,
  userContent: string,
  assistantContent: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const convoId = await getOrCreateConversation(agentType, userHandle);

  await addMessage(convoId, {
    role: "user",
    content: userContent,
    metadata: { timestamp: new Date().toISOString() },
  });

  await addMessage(convoId, {
    role: "assistant",
    content: assistantContent,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  });
}

/**
 * Save a tool call + result pair to a specific agent's memory.
 */
export async function saveToolInteraction(
  agentType: AgentType,
  userHandle: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolResult: Record<string, unknown>,
): Promise<void> {
  const convoId = await getOrCreateConversation(agentType, userHandle);

  await addMessage(convoId, {
    role: "tool_call",
    content: JSON.stringify({ tool: toolName, args: toolArgs }),
    metadata: { toolName, timestamp: new Date().toISOString() },
  });

  await addMessage(convoId, {
    role: "tool_result",
    content: JSON.stringify({ tool: toolName, result: toolResult }),
    metadata: { toolName, timestamp: new Date().toISOString() },
  });
}
