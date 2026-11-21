import type {
  Flashcard,
  NoteStyle,
  QuizQuestion,
  StructuredNotes,
  StudyMaterial,
  TranscriptSegment,
  UserProfile,
  YouTubeVideo,
} from "../types";

const TOKEN_STORAGE_KEY = "studymate_auth_token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : ({} as Record<string, unknown>);

  if (!response.ok) {
    const message =
      typeof data.error === "string" && data.error
        ? data.error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}

export async function registerStudent(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: UserProfile; token: string }> {
  const res = await apiRequest<{ user: UserProfile; token: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setStoredToken(res.token);
  return res;
}

export async function loginStudent(input: {
  email: string;
  password: string;
}): Promise<{ user: UserProfile; token: string }> {
  const res = await apiRequest<{ user: UserProfile; token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setStoredToken(res.token);
  return res;
}

export async function logoutStudent(): Promise<void> {
  try {
    await apiRequest<{ success: boolean }>("/api/auth/logout", { method: "POST" });
  } finally {
    setStoredToken(null);
  }
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  try {
    const res = await apiRequest<{ user: UserProfile }>("/api/auth/me");
    return res.user;
  } catch {
    return null;
  }
}

export async function searchYouTubeVideos(
  query: string
): Promise<{ videos: YouTubeVideo[]; source: string }> {
  return apiRequest<{ videos: YouTubeVideo[]; source: string }>(
    `/api/videos/search?q=${encodeURIComponent(query)}`
  );
}

export async function fetchVideoTranscript(videoId: string): Promise<{
  transcriptAvailable: boolean;
  segments: TranscriptSegment[];
  transcriptText: string;
  message?: string;
}> {
  return apiRequest<{
    transcriptAvailable: boolean;
    segments: TranscriptSegment[];
    transcriptText: string;
    message?: string;
  }>(`/api/videos/${encodeURIComponent(videoId)}/transcript`);
}

export async function generateStudyNotes(input: {
  videoId?: string;
  videoTitle: string;
  channelTitle: string;
  videoDescription?: string;
  transcript: string;
  style: NoteStyle;
}): Promise<{
  notes: StructuredNotes;
  notesMarkdown: string;
  noteStyle: NoteStyle;
  sourceMode?: string;
}> {
  return apiRequest<{
    notes: StructuredNotes;
    notesMarkdown: string;
    noteStyle: NoteStyle;
    sourceMode?: string;
  }>("/api/study/notes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function translateStudyNotes(input: {
  notes: StructuredNotes;
  targetLanguage: string;
}): Promise<{
  notes: StructuredNotes;
  notesMarkdown: string;
  language: string;
}> {
  return apiRequest<{
    notes: StructuredNotes;
    notesMarkdown: string;
    language: string;
  }>("/api/study/translate-notes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateStudyQuiz(input: {
  videoId?: string;
  videoTitle: string;
  channelTitle?: string;
  videoDescription?: string;
  transcript: string;
  notesMarkdown: string;
  questionCount: number;
}): Promise<{ quiz: QuizQuestion[]; sourceMode?: string }> {
  return apiRequest<{ quiz: QuizQuestion[]; sourceMode?: string }>("/api/study/quiz", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateStudyFlashcards(input: {
  videoId?: string;
  videoTitle: string;
  channelTitle?: string;
  videoDescription?: string;
  transcript: string;
  notesMarkdown: string;
  cardCount: number;
}): Promise<{ flashcards: Flashcard[]; sourceMode?: string }> {
  return apiRequest<{ flashcards: Flashcard[]; sourceMode?: string }>("/api/study/flashcards", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function askLessonTutor(input: {
  videoId?: string;
  videoTitle: string;
  channelTitle?: string;
  videoDescription?: string;
  transcript: string;
  notesMarkdown: string;
  question: string;
}): Promise<{ answer: string }> {
  return apiRequest<{ answer: string }>("/api/study/ask", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function generateAITranscript(input: {
  videoId: string;
  videoTitle: string;
  channelTitle: string;
  videoDescription?: string;
}): Promise<{ transcriptText: string; method: string }> {
  return apiRequest<{ transcriptText: string; method: string }>("/api/study/ai-transcript", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listSavedMaterials(): Promise<StudyMaterial[]> {
  const res = await apiRequest<{ materials: StudyMaterial[] }>("/api/study/materials");
  return res.materials;
}

export async function saveStudyMaterial(input: {
  id?: string;
  videoId: string;
  videoTitle: string;
  channelTitle: string;
  thumbnailUrl: string;
  transcript: string;
  noteStyle: NoteStyle;
  notes: StructuredNotes | null;
  notesMarkdown: string;
  quiz: QuizQuestion[];
  flashcards?: Flashcard[];
  lastQuizScore?: number | null;
  lastQuizTotal?: number | null;
}): Promise<StudyMaterial> {
  const res = await apiRequest<{ material: StudyMaterial }>("/api/study/materials", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.material;
}

export async function updateSavedQuizScore(
  id: string,
  score: number,
  total: number
): Promise<StudyMaterial> {
  const res = await apiRequest<{ material: StudyMaterial }>(
    `/api/study/materials/${encodeURIComponent(id)}/score`,
    {
      method: "PATCH",
      body: JSON.stringify({ score, total }),
    }
  );
  return res.material;
}

export async function deleteSavedMaterial(id: string): Promise<void> {
  await apiRequest<{ success: boolean }>(
    `/api/study/materials/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}
