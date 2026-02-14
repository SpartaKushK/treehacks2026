const HEYGEN_API_BASE = "https://api.heygen.com";

function getApiKey(): string {
  return process.env.HEYGEN_API_KEY || "";
}

function headers(): Record<string, string> {
  return {
    "X-Api-Key": getApiKey(),
    "Content-Type": "application/json",
  };
}

export interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  preview_image_url: string;
  gender?: string;
  isCustom?: boolean;
}

// In-memory cache: avatar list + timestamp
let cachedAvatars: HeyGenAvatar[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/** List available HeyGen avatars (cached). */
export async function listAvatars(): Promise<HeyGenAvatar[]> {
  if (!getApiKey()) return [];

  // Return cached if fresh
  if (cachedAvatars && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedAvatars;
  }

  const res = await fetch(`${HEYGEN_API_BASE}/v2/avatars`, {
    headers: headers(),
  });

  if (!res.ok) return cachedAvatars || [];

  const data = await res.json();
  // v2 returns { data: { avatars: [...] } }
  const allAvatars = data?.data?.avatars || [];
  cachedAvatars = allAvatars
    .filter((a: Record<string, unknown>) => a.preview_image_url)
    .map((a: Record<string, unknown>) => ({
      avatar_id: a.avatar_id as string,
      avatar_name: (a.avatar_name as string) || "Unnamed",
      preview_image_url: (a.preview_image_url as string) || "",
      gender: (a.gender as string) || undefined,
      // Custom avatars have hex-hash IDs; public ones use human-readable names
      isCustom: /^[0-9a-f]{32}$/i.test(a.avatar_id as string),
    }));
  cacheTimestamp = Date.now();

  return cachedAvatars!;
}

/** Get the preview photo URL for a given avatar ID. */
export async function getAvatarPhoto(avatarId: string): Promise<string | null> {
  const avatars = await listAvatars();
  const match = avatars.find((a) => a.avatar_id === avatarId);
  return match?.preview_image_url || null;
}

/** Create a streaming session token for the interactive avatar SDK. */
export async function createStreamingToken(): Promise<string | null> {
  if (!getApiKey()) return null;

  const res = await fetch(`${HEYGEN_API_BASE}/v1/streaming.create_token`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data?.data?.token || null;
}
