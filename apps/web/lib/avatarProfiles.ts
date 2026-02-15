/**
 * Pre-defined HeyGen avatar profiles for the app.
 *
 * To change the avatar, update the `avatarId` to any valid HeyGen avatar ID.
 * You can find available IDs by browsing the avatar picker in the agent config page.
 */

export interface AvatarProfile {
  avatarId: string;
  name: string;
  role: "grandma" | "doctor";
  greeting: string;
  voiceEmotion?: "excited" | "serious" | "friendly" | "soothing" | "broadcaster";
}

export const GRANDMA_PROFILE: AvatarProfile = {
  avatarId: "Anna_public_3_20240108",   // Warm, approachable female avatar
  name: "Grandma",
  role: "grandma",
  greeting:
    "Hi sweetie! I'm here to help you keep track of your health. Don't worry, everything is going to be just fine.",
};

export const DOCTOR_PROFILE: AvatarProfile = {
  avatarId: "Wayne_20240711",           // Professional male avatar
  name: "Dr. Smith",
  role: "doctor",
  greeting:
    "Hello, I'm Dr. Smith. I'll be reviewing your health information and helping coordinate your care today.",
  voiceEmotion: "friendly",
};
