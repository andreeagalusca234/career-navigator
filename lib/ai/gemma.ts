import { z } from "zod";

type GemmaGenerateOptions = {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  responseMimeType?: "application/json" | "text/plain";
  thinking?: boolean;
};

type GeminiApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const apiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";

export function getGemmaApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

export function getGemmaModel(kind: "fast" | "reasoning" = "fast"): string {
  if (kind === "reasoning") {
    return process.env.GEMMA_REASONING_MODEL || "gemma-4-31b-it";
  }

  return process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it";
}

export function isGemmaConfigured(): boolean {
  return Boolean(getGemmaApiKey());
}

function extractText(data: GeminiApiResponse): string {
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  const jsonText =
    firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate.trim();

  return JSON.parse(jsonText);
}

export async function generateGemmaText(options: GemmaGenerateOptions): Promise<{
  text: string;
  model: string;
}> {
  const apiKey = getGemmaApiKey();
  const model = options.model ?? getGemmaModel(options.thinking ? "reasoning" : "fast");

  if (!apiKey) {
    throw new Error("Gemma 4 is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(
      `${apiBaseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: options.prompt }]
          }
        ],
        systemInstruction: options.systemInstruction
          ? {
              parts: [{ text: options.systemInstruction }]
            }
          : undefined,
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          responseMimeType: options.responseMimeType,
          thinkingConfig: options.thinking ? { thinkingLevel: "high" } : undefined
        }
      })
      }
    );

    const data = (await response.json().catch(() => ({}))) as GeminiApiResponse;

    if (!response.ok) {
      throw new Error(data.error?.message || `Gemma 4 request failed with status ${response.status}.`);
    }

    const text = extractText(data);
    if (!text) {
      throw new Error("Gemma 4 returned an empty response.");
    }

    return { text, model };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateGemmaJson<T>(
  schema: z.ZodType<T>,
  options: Omit<GemmaGenerateOptions, "responseMimeType">
): Promise<{
  data: T;
  model: string;
}> {
  const response = await generateGemmaText({
    ...options,
    responseMimeType: "application/json"
  });

  return {
    data: schema.parse(parseJson(response.text)),
    model: response.model
  };
}
