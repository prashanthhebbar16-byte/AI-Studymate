import crypto from "node:crypto";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import express from "express";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth.ts";
import { requireAuth } from "../auth.ts";
import {
  deleteMaterial,
  listMaterialsByUser,
  updateMaterialScore,
  upsertStudyMaterial,
} from "../db.ts";
import type {
  Flashcard,
  NoteStyle,
  QuizQuestion,
  StructuredNotes,
} from "../../src/types.ts";

const router = express.Router();

const PRIMARY_GEMINI_MODEL = "gemini-4-hydrogen";
const LITE_GEMINI_MODEL = "gemini-3.1-flash-lite";

const responseCache = new Map<string, { value: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached(key: string, value: unknown): void {
  if (responseCache.size > 100) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function isTransientOrOverloadError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("500") ||
    msg.includes("resource_exhausted") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("heavy load") ||
    msg.includes("timeout")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

async function callGroqFallback(params: {
  systemInstruction: string;
  userPrompt: string;
  expectJson: boolean;
}): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) {
    throw new Error("GROQ_NOT_CONFIGURED");
  }

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: params.systemInstruction },
        { role: "user", content: params.userPrompt },
      ],
      ...(params.expectJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Groq fallback failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty response from Groq fallback.");
  }
  return content;
}

async function generateWithResilientAI(params: {
  systemInstruction: string;
  textPrompt: string;
  videoId?: string;
  videoTitle?: string;
  channelTitle?: string;
  videoDescription?: string;
  hasTranscript: boolean;
  responseSchema?: Record<string, unknown>;
  expectJson: boolean;
}): Promise<{ text: string; provider: string; sourceMode: "transcript" | "video" | "topic" }> {
  const ai = getGeminiClient();

  if (ai) {
    const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; delayMs: number }> = [
      { model: PRIMARY_GEMINI_MODEL, thinkingLevel: ThinkingLevel.LOW, delayMs: 0 },
      { model: LITE_GEMINI_MODEL, thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 450 },
      { model: LITE_GEMINI_MODEL, thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 1100 },
    ];

    let lastErr: unknown = null;

    // Strategy 1: If transcript is available, use text directly; otherwise try multimodal YouTube fileUri first
    const shouldTryVideoFileUri = !params.hasTranscript && Boolean(params.videoId);

    if (shouldTryVideoFileUri && params.videoId) {
      const watchUrl = `https://www.youtube.com/watch?v=${params.videoId}`;
      for (const attempt of attempts.slice(0, 2)) {
        if (attempt.delayMs > 0) await sleep(attempt.delayMs);
        try {
          const response = await ai.models.generateContent({
            model: attempt.model,
            contents: {
              parts: [
                {
                  fileData: {
                    fileUri: watchUrl,
                  },
                },
                {
                  text: params.textPrompt,
                },
              ],
            },
            config: {
              systemInstruction: params.systemInstruction,
              thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
              ...(params.expectJson ? { responseMimeType: "application/json" } : {}),
              ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
            },
          });
          const text = (response.text ?? "").trim();
          if (text) {
            return { text, provider: attempt.model, sourceMode: "video" };
          }
        } catch (err) {
          lastErr = err;
          // If YouTube URL multimodal isn't supported for this specific video, break immediately to grounded topic fallback
          if (!isTransientOrOverloadError(err)) {
            break;
          }
        }
      }

      // Strategy 2 for non-transcribed videos when fileData is unavailable: Google Search + URL grounding
      try {
        const groundedPrompt = [
          params.textPrompt,
          "",
          `YouTube Video URL: ${watchUrl}`,
          `Video Title: ${params.videoTitle || "Educational Video"}`,
          `Channel / Instructor: ${params.channelTitle || "Unknown"}`,
          params.videoDescription ? `Description: ${params.videoDescription}` : "",
          params.expectJson
            ? "Respond strictly with valid JSON matching the requested schema (no markdown fences)."
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        const groundedResp = await ai.models.generateContent({
          model: PRIMARY_GEMINI_MODEL,
          contents: groundedPrompt,
          config: {
            systemInstruction: params.systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            tools: [{ googleSearch: {} }],
          },
        });
        const text = (groundedResp.text ?? "").trim();
        if (text) {
          return {
            text: params.expectJson ? extractJsonObject(text) : text,
            provider: PRIMARY_GEMINI_MODEL,
            sourceMode: "topic",
          };
        }
      } catch (err) {
        lastErr = err;
      }
    } else {
      for (const attempt of attempts) {
        if (attempt.delayMs > 0) {
          await sleep(attempt.delayMs);
        }
        try {
          const response = await ai.models.generateContent({
            model: attempt.model,
            contents: params.textPrompt,
            config: {
              systemInstruction: params.systemInstruction,
              thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
              ...(params.expectJson ? { responseMimeType: "application/json" } : {}),
              ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
            },
          });
          const text = (response.text ?? "").trim();
          if (text) {
            return { text, provider: attempt.model, sourceMode: "transcript" };
          }
        } catch (err) {
          lastErr = err;
          if (!isTransientOrOverloadError(err)) {
            break;
          }
        }
      }
    }

    if (process.env.GROQ_API_KEY?.trim()) {
      const groqText = await callGroqFallback({
        systemInstruction: params.systemInstruction,
        userPrompt: params.textPrompt,
        expectJson: params.expectJson,
      });
      return {
        text: params.expectJson ? extractJsonObject(groqText) : groqText,
        provider: "groq-llama-3.3",
        sourceMode: params.hasTranscript ? "transcript" : "topic",
      };
    }

    throw lastErr;
  }

  if (process.env.GROQ_API_KEY?.trim()) {
    const groqText = await callGroqFallback({
      systemInstruction: params.systemInstruction,
      userPrompt: params.textPrompt,
      expectJson: params.expectJson,
    });
    return {
      text: params.expectJson ? extractJsonObject(groqText) : groqText,
      provider: "groq-llama-3.3",
      sourceMode: params.hasTranscript ? "transcript" : "topic",
    };
  }

  throw new Error(
    "GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY (or optional free-tier GROQ_API_KEY) in Settings > Secrets."
  );
}

function formatNotesMarkdown(notes: StructuredNotes): string {
  const lines: string[] = [];
  lines.push(`# ${notes.title}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(notes.summary);
  lines.push("");

  if (notes.keyConcepts.length > 0) {
    lines.push("## Key Concepts");
    for (const concept of notes.keyConcepts) {
      lines.push(`### ${concept.heading}`);
      lines.push(concept.explanation);
      lines.push("");
    }
  }

  if (notes.structuredOutline.length > 0) {
    lines.push("## Structured Study Outline");
    for (const section of notes.structuredOutline) {
      lines.push(`### ${section.sectionTitle}`);
      for (const point of section.points) {
        lines.push(`- ${point}`);
      }
      lines.push("");
    }
  }

  if (notes.keyTerms.length > 0) {
    lines.push("## Key Terms & Definitions");
    for (const item of notes.keyTerms) {
      lines.push(`- **${item.term}**: ${item.definition}`);
    }
    lines.push("");
  }

  if (notes.takeaways.length > 0) {
    lines.push("## Exam & Revision Takeaways");
    for (const takeaway of notes.takeaways) {
      lines.push(`- ${takeaway}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function formatAIError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("GEMINI_API_KEY is not configured")) {
    return { status: 503, message: msg };
  }
  if (msg.includes("403") || msg.includes("PERMISSION_DENIED") || msg.includes("API_KEY_INVALID")) {
    return {
      status: 400,
      message: "API key was rejected. Please verify your GEMINI_API_KEY in Settings > Secrets.",
    };
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message:
        "AI service is temporarily busy across primary and lite models. Please wait a few seconds and try again.",
    };
  }
  return {
    status: 500,
    message: "Failed to generate study content. Please try again in a moment.",
  };
}

router.post("/ai-transcript", async (req: Request, res: Response) => {
  try {
    const { videoId, videoTitle, channelTitle, videoDescription } = req.body as {
      videoId?: string;
      videoTitle?: string;
      channelTitle?: string;
      videoDescription?: string;
    };

    if (!videoId) {
      res.status(400).json({ error: "A YouTube video must be loaded to generate an AI transcript." });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: "GEMINI_API_KEY is required on the server to transcribe videos with AI.",
      });
      return;
    }

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    for (const model of [PRIMARY_GEMINI_MODEL, LITE_GEMINI_MODEL]) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              { fileData: { fileUri: watchUrl } },
              {
                text: `Provide a clean, well-punctuated spoken transcript and key visual board/slide notes of this educational video ("${
                  videoTitle || videoId
                }"). Output plain text paragraphs only.`,
              },
            ],
          },
          config: {
            thinkingConfig: {
              thinkingLevel:
                model === PRIMARY_GEMINI_MODEL ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL,
            },
          },
        });
        const text = (response.text ?? "").trim();
        if (text.length >= 20) {
          res.json({ transcriptText: text, method: "video" });
          return;
        }
      } catch (err) {
        if (!isTransientOrOverloadError(err)) {
          break;
        }
      }
    }

    // Fallback: detailed topic lecture outline grounded via Search
    const fallbackResp = await ai.models.generateContent({
      model: PRIMARY_GEMINI_MODEL,
      contents: [
        `The video "${videoTitle || videoId}" by ${channelTitle || "YouTube"} (${watchUrl}) has disabled captions.`,
        videoDescription ? `Video description: ${videoDescription}` : "",
        "Using reliable educational knowledge and search grounding for this specific topic/lecture, write a comprehensive spoken-style lecture summary covering all core concepts taught on this topic so the student can generate notes and quizzes.",
      ]
        .filter(Boolean)
        .join("\n"),
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const fallbackText = (fallbackResp.text ?? "").trim();
    if (!fallbackText) {
      res.status(502).json({
        error: "Could not transcribe this video automatically. Please paste lecture text instead.",
      });
      return;
    }

    res.json({ transcriptText: fallbackText, method: "grounded_summary" });
  } catch (err) {
    console.error("[study/ai-transcript]", err);
    const formatted = formatAIError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

router.post("/notes", async (req: Request, res: Response) => {
  try {
    const { videoId, videoTitle, channelTitle, videoDescription, transcript, style } = req.body as {
      videoId?: string;
      videoTitle?: string;
      channelTitle?: string;
      videoDescription?: string;
      transcript?: string;
      style?: NoteStyle;
    };

    const cleanTranscript = (transcript ?? "").trim();
    const hasTranscript = cleanTranscript.length >= 30;

    if (!hasTranscript && !videoId) {
      res.status(400).json({
        error:
          "Please select a video or provide at least 30 characters of transcript text to generate study notes.",
      });
      return;
    }

    const noteStyle: NoteStyle =
      style === "detailed" || style === "simplified" ? style : "concise";

    const cacheKey = crypto
      .createHash("sha256")
      .update(
        `notes:${noteStyle}:${videoId ?? ""}:${videoTitle ?? ""}:${
          hasTranscript ? cleanTranscript.slice(0, 45000) : "no-transcript"
        }`
      )
      .digest("hex");

    const cached = getCached<{
      notes: StructuredNotes;
      notesMarkdown: string;
      noteStyle: NoteStyle;
      sourceMode: string;
    }>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const styleGuidance: Record<NoteStyle, string> = {
      concise:
        "Keep explanations crisp, high-yield, and revision-ready with bulleted clarity for quick exam review.",
      detailed:
        "Provide thorough academic depth, step-by-step explanations, formulas or mechanisms if relevant, and comprehensive section outlines.",
      simplified:
        "Explain every concept in plain, beginner-friendly language using clear analogies.",
    };

    const clippedTranscript = cleanTranscript.slice(0, 45000);

    const textPrompt = hasTranscript
      ? [
          `Video Title: ${videoTitle || "Educational Video"}`,
          `Instructor / Channel: ${channelTitle || "Unknown"}`,
          `Style Preference: ${noteStyle} — ${styleGuidance[noteStyle]}`,
          "",
          "Transcript:",
          clippedTranscript,
        ].join("\n")
      : [
          `Generate comprehensive, structured study notes directly from this educational video ("${
            videoTitle || "Educational Video"
          }" by ${channelTitle || "Instructor"}).`,
          videoDescription ? `Video Description: ${videoDescription}` : "",
          `Style Preference: ${noteStyle} — ${styleGuidance[noteStyle]}`,
        ]
          .filter(Boolean)
          .join("\n");

    const { text, sourceMode } = await generateWithResilientAI({
      systemInstruction:
        'You are an expert academic study tutor. Produce accurate, clearly structured, student-friendly study notes. Return valid JSON matching keys: title (string), summary (string), keyConcepts (array of {heading, explanation}), structuredOutline (array of {sectionTitle, points}), keyTerms (array of {term, definition}), takeaways (string[]).',
      textPrompt,
      videoId,
      videoTitle,
      channelTitle,
      videoDescription,
      hasTranscript,
      expectJson: true,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          keyConcepts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ["heading", "explanation"],
            },
          },
          structuredOutline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sectionTitle: { type: Type.STRING },
                points: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["sectionTitle", "points"],
            },
          },
          keyTerms: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                definition: { type: Type.STRING },
              },
              required: ["term", "definition"],
            },
          },
          takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          "title",
          "summary",
          "keyConcepts",
          "structuredOutline",
          "keyTerms",
          "takeaways",
        ],
      },
    });

    const notes = JSON.parse(extractJsonObject(text)) as StructuredNotes;
    const notesMarkdown = formatNotesMarkdown(notes);
    const payload = { notes, notesMarkdown, noteStyle, sourceMode };
    setCached(cacheKey, payload);

    res.json(payload);
  } catch (err) {
    console.error("[study/notes]", err);
    const formatted = formatAIError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

router.post("/translate-notes", async (req: Request, res: Response) => {
  try {
    const { notes, targetLanguage } = req.body as {
      notes?: StructuredNotes;
      targetLanguage?: string;
    };

    const cleanLang = (targetLanguage ?? "").trim();
    if (!cleanLang) {
      res.status(400).json({ error: "Please select or enter a target language." });
      return;
    }
    if (!notes || !notes.title || !notes.summary) {
      res.status(400).json({ error: "Generate study notes first before translating." });
      return;
    }

    const cacheKey = crypto
      .createHash("sha256")
      .update(`translate:${cleanLang.toLowerCase()}:${JSON.stringify(notes)}`)
      .digest("hex");

    const cached = getCached<{
      notes: StructuredNotes;
      notesMarkdown: string;
      language: string;
    }>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const { text } = await generateWithResilientAI({
      systemInstruction: `You are an expert multilingual academic translator. Translate the provided structured study notes accurately into ${cleanLang}. Use natural, student-friendly academic ${cleanLang}, and keep essential technical terms or formulas recognizable (including the English term in parentheses where helpful for exams). Return valid JSON matching the exact same schema.`,
      textPrompt: `Translate these study notes into ${cleanLang}:\n\n${JSON.stringify(notes)}`,
      hasTranscript: true,
      expectJson: true,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          keyConcepts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ["heading", "explanation"],
            },
          },
          structuredOutline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sectionTitle: { type: Type.STRING },
                points: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["sectionTitle", "points"],
            },
          },
          keyTerms: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                definition: { type: Type.STRING },
              },
              required: ["term", "definition"],
            },
          },
          takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          "title",
          "summary",
          "keyConcepts",
          "structuredOutline",
          "keyTerms",
          "takeaways",
        ],
      },
    });

    const translated = JSON.parse(extractJsonObject(text)) as StructuredNotes;
    const notesMarkdown = formatNotesMarkdown(translated);
    const payload = { notes: translated, notesMarkdown, language: cleanLang };
    setCached(cacheKey, payload);

    res.json(payload);
  } catch (err) {
    console.error("[study/translate-notes]", err);
    const formatted = formatAIError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

router.post("/quiz", async (req: Request, res: Response) => {
  try {
    const {
      videoId,
      videoTitle,
      channelTitle,
      videoDescription,
      transcript,
      notesMarkdown,
      questionCount,
    } = req.body as {
      videoId?: string;
      videoTitle?: string;
      channelTitle?: string;
      videoDescription?: string;
      transcript?: string;
      notesMarkdown?: string;
      questionCount?: number;
    };

    const sourceText = ((transcript ?? "").trim() || (notesMarkdown ?? "").trim()).slice(0, 40000);
    const hasTranscript = sourceText.length >= 30;

    if (!hasTranscript && !videoId) {
      res.status(400).json({
        error: "Please select a video or provide a transcript/notes before creating a quiz.",
      });
      return;
    }

    const count = Math.min(10, Math.max(3, Number(questionCount) || 5));

    const textPrompt = hasTranscript
      ? [
          `Create exactly ${count} multiple-choice quiz questions to test student comprehension of this topic.`,
          `Topic / Video: ${videoTitle || "Study Topic"}`,
          "",
          "Source Material:",
          sourceText,
        ].join("\n")
      : [
          `Create exactly ${count} multiple-choice quiz questions directly based on this educational video ("${
            videoTitle || "Study Topic"
          }" by ${channelTitle || "Instructor"}).`,
          videoDescription ? `Video Description: ${videoDescription}` : "",
        ]
          .filter(Boolean)
          .join("\n");

    const { text, sourceMode } = await generateWithResilientAI({
      systemInstruction:
        'You are an academic assessment designer. Return JSON object {"questions": [{"question": string, "options": [string, string, string, string], "correctIndex": integer (0..3), "explanation": string}]}.',
      textPrompt,
      videoId,
      videoTitle,
      channelTitle,
      videoDescription,
      hasTranscript,
      expectJson: true,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
              },
              required: ["question", "options", "correctIndex", "explanation"],
            },
          },
        },
        required: ["questions"],
      },
    });

    const parsed = JSON.parse(extractJsonObject(text)) as
      | {
          questions?: Array<{
            question: string;
            options: string[];
            correctIndex: number;
            explanation: string;
          }>;
        }
      | Array<{ question: string; options: string[]; correctIndex: number; explanation: string }>;

    const rawQuestions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.questions)
        ? parsed.questions
        : [];

    const quiz: QuizQuestion[] = rawQuestions.map((q) => ({
      id: crypto.randomUUID(),
      question: q.question,
      options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
      correctIndex:
        typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex < 4
          ? q.correctIndex
          : 0,
      explanation: q.explanation || "",
    }));

    res.json({ quiz, sourceMode });
  } catch (err) {
    console.error("[study/quiz]", err);
    const formatted = formatAIError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

router.post("/flashcards", async (req: Request, res: Response) => {
  try {
    const {
      videoId,
      videoTitle,
      channelTitle,
      videoDescription,
      transcript,
      notesMarkdown,
      cardCount,
    } = req.body as {
      videoId?: string;
      videoTitle?: string;
      channelTitle?: string;
      videoDescription?: string;
      transcript?: string;
      notesMarkdown?: string;
      cardCount?: number;
    };

    const sourceText = ((transcript ?? "").trim() || (notesMarkdown ?? "").trim()).slice(0, 40000);
    const hasTranscript = sourceText.length >= 30;

    if (!hasTranscript && !videoId) {
      res.status(400).json({
        error: "Please select a video or provide a transcript/notes before creating flashcards.",
      });
      return;
    }

    const count = Math.min(12, Math.max(4, Number(cardCount) || 8));

    const textPrompt = hasTranscript
      ? [
          `Create ${count} active-recall flashcards covering the key ideas from this lesson.`,
          `Topic / Video: ${videoTitle || "Study Topic"}`,
          "",
          "Source Material:",
          sourceText,
        ].join("\n")
      : [
          `Create ${count} active-recall flashcards covering the core concepts taught in this educational video ("${
            videoTitle || "Study Topic"
          }" by ${channelTitle || "Instructor"}).`,
          videoDescription ? `Video Description: ${videoDescription}` : "",
        ]
          .filter(Boolean)
          .join("\n");

    const { text, sourceMode } = await generateWithResilientAI({
      systemInstruction:
        'You are an active-recall flashcard designer. Return JSON object {"flashcards": [{"front": string, "back": string}]}. Front should be a concise question or concept prompt; Back should be a clear, memorable answer.',
      textPrompt,
      videoId,
      videoTitle,
      channelTitle,
      videoDescription,
      hasTranscript,
      expectJson: true,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING },
                back: { type: Type.STRING },
              },
              required: ["front", "back"],
            },
          },
        },
        required: ["flashcards"],
      },
    });

    const parsed = JSON.parse(extractJsonObject(text)) as {
      flashcards?: Array<{ front: string; back: string }>;
    };
    const flashcards: Flashcard[] = (parsed.flashcards ?? []).map((fc) => ({
      id: crypto.randomUUID(),
      front: fc.front,
      back: fc.back,
    }));

    res.json({ flashcards, sourceMode });
  } catch (err) {
    console.error("[study/flashcards]", err);
    const formatted = formatAIError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

router.post("/ask", async (req: Request, res: Response) => {
  try {
    const {
      videoId,
      videoTitle,
      channelTitle,
      videoDescription,
      transcript,
      notesMarkdown,
      question,
    } = req.body as {
      videoId?: string;
      videoTitle?: string;
      channelTitle?: string;
      videoDescription?: string;
      transcript?: string;
      notesMarkdown?: string;
      question?: string;
    };

    const cleanQuestion = (question ?? "").trim();
    if (cleanQuestion.length < 3) {
      res.status(400).json({ error: "Please enter a question about this lesson." });
      return;
    }

    const sourceText = ((transcript ?? "").trim() || (notesMarkdown ?? "").trim()).slice(0, 40000);
    const hasTranscript = sourceText.length >= 30;

    if (!hasTranscript && !videoId) {
      res.status(400).json({
        error: "Select a video or provide a transcript first so the tutor can answer.",
      });
      return;
    }

    const textPrompt = hasTranscript
      ? [
          `Lesson: ${videoTitle || "Educational Video"}`,
          "",
          "Lesson Material:",
          sourceText,
          "",
          `Student Question: ${cleanQuestion}`,
        ].join("\n")
      : [
          `Lesson Video: ${videoTitle || "Educational Video"} by ${channelTitle || "Instructor"}`,
          videoDescription ? `Description: ${videoDescription}` : "",
          "",
          `Student Question: ${cleanQuestion}`,
        ]
          .filter(Boolean)
          .join("\n");

    const { text } = await generateWithResilientAI({
      systemInstruction:
        "You are a concise, patient academic tutor. Answer the student's question accurately using the video or lesson topic. Keep your response clear, structured, and easy to revise.",
      textPrompt,
      videoId,
      videoTitle,
      channelTitle,
      videoDescription,
      hasTranscript,
      expectJson: false,
    });

    res.json({ answer: text });
  } catch (err) {
    console.error("[study/ask]", err);
    const formatted = formatAIError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

router.get("/materials", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const materials = await listMaterialsByUser(req.userId!);
    res.json({ materials });
  } catch (err) {
    console.error("[study/materials GET]", err);
    res.status(500).json({ error: "Failed to load saved study materials." });
  }
});

router.post("/materials", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body as {
      id?: string;
      videoId?: string;
      videoTitle?: string;
      channelTitle?: string;
      thumbnailUrl?: string;
      transcript?: string;
      noteStyle?: NoteStyle;
      notes?: StructuredNotes | null;
      notesMarkdown?: string;
      quiz?: QuizQuestion[];
      flashcards?: Flashcard[];
      lastQuizScore?: number | null;
      lastQuizTotal?: number | null;
    };

    if (!body.videoId || !body.videoTitle) {
      res.status(400).json({ error: "Video ID and title are required to save study materials." });
      return;
    }

    const material = await upsertStudyMaterial({
      id: body.id,
      userId: req.userId!,
      videoId: body.videoId,
      videoTitle: body.videoTitle,
      channelTitle: body.channelTitle || "YouTube",
      thumbnailUrl:
        body.thumbnailUrl || `https://i.ytimg.com/vi/${body.videoId}/hqdefault.jpg`,
      transcript: body.transcript || "",
      noteStyle: body.noteStyle || "concise",
      notes: body.notes ?? null,
      notesMarkdown: body.notesMarkdown || "",
      quiz: Array.isArray(body.quiz) ? body.quiz : [],
      flashcards: Array.isArray(body.flashcards) ? body.flashcards : [],
      lastQuizScore: body.lastQuizScore,
      lastQuizTotal: body.lastQuizTotal,
    });

    res.status(201).json({ material });
  } catch (err) {
    console.error("[study/materials POST]", err);
    res.status(500).json({ error: "Failed to save study material." });
  }
});

router.patch("/materials/:id/score", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { score, total } = req.body as { score?: number; total?: number };
    if (typeof score !== "number" || typeof total !== "number" || total <= 0) {
      res.status(400).json({ error: "Valid score and total question count are required." });
      return;
    }
    const updated = await updateMaterialScore(String(req.params.id), req.userId!, score, total);
    if (!updated) {
      res.status(404).json({ error: "Saved study material not found." });
      return;
    }
    res.json({ material: updated });
  } catch (err) {
    console.error("[study/materials PATCH score]", err);
    res.status(500).json({ error: "Failed to update quiz score." });
  }
});

router.delete("/materials/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await deleteMaterial(String(req.params.id), req.userId!);
    if (!deleted) {
      res.status(404).json({ error: "Study material not found." });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[study/materials DELETE]", err);
    res.status(500).json({ error: "Failed to delete study material." });
  }
});

export default router;
