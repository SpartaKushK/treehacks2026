import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Speech-to-text endpoint supporting both Deepgram and Whisper (OpenAI)
 * Pass audio as FormData with an 'audio' field
 * Optional: 'language' field for target language (e.g., 'en', 'es', 'fr')
 * Optional: 'provider' field: 'deepgram' (default) or 'whisper'
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const language = (formData.get("language") as string) || "en";
    const provider = (formData.get("provider") as string) || "deepgram";

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    if (provider === "deepgram") {
      return await handleDeepgram(audioFile, language);
    } else if (provider === "whisper") {
      return await handleWhisper(audioFile, language);
    } else {
      return NextResponse.json(
        { error: "Invalid provider. Use 'deepgram' or 'whisper'" },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("[speech-to-text]", err);
    return NextResponse.json(
      {
        error: "Speech-to-text failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function handleDeepgram(audioFile: File, language: string) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPGRAM_API_KEY not configured" },
      { status: 500 }
    );
  }

  const audioBuffer = await audioFile.arrayBuffer();

  const response = await fetch(
    `https://api.deepgram.com/v1/listen?language=${language}&model=nova-2&smart_format=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": audioFile.type || "audio/webm",
      },
      body: audioBuffer,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Deepgram error]", errorText);
    return NextResponse.json(
      { error: "Deepgram API failed", detail: errorText },
      { status: response.status }
    );
  }

  const data = await response.json();
  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  const confidence = data.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

  return NextResponse.json({
    transcript,
    confidence,
    language,
    provider: "deepgram",
  });
}

async function handleWhisper(audioFile: File, language: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-1");
  formData.append("language", language);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Whisper error]", errorText);
    return NextResponse.json(
      { error: "Whisper API failed", detail: errorText },
      { status: response.status }
    );
  }

  const data = await response.json();
  const transcript = data.text || "";

  return NextResponse.json({
    transcript,
    confidence: 1.0,
    language,
    provider: "whisper",
  });
}
