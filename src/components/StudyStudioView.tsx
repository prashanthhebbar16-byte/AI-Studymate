import {
  BookmarkCheck,
  BookmarkPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  Languages,
  Layers,
  Loader2,
  MessageSquare,
  Printer,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  askLessonTutor,
  fetchVideoTranscript,
  generateAITranscript,
  generateStudyFlashcards,
  generateStudyNotes,
  generateStudyQuiz,
  searchYouTubeVideos,
  translateStudyNotes,
} from "../api/client";
import {
  downloadMarkdownFile,
  downloadNotesAsPdf,
  downloadNotesAsWord,
  downloadQuizAsPdf,
  downloadQuizAsWord,
  downloadTutorAnswersAsPdf,
  downloadTutorAnswersAsWord,
} from "../utils/exportDocument";
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

export interface StudioSessionState {
  savedId?: string;
  video: YouTubeVideo | null;
  transcript: string;
  segments: TranscriptSegment[];
  noteStyle: NoteStyle;
  notes: StructuredNotes | null;
  notesMarkdown: string;
  quiz: QuizQuestion[];
  flashcards: Flashcard[];
  lastQuizScore: number | null;
  lastQuizTotal: number | null;
}

interface StudyStudioViewProps {
  user: UserProfile | null;
  session: StudioSessionState;
  onUpdateSession: (updater: (prev: StudioSessionState) => StudioSessionState) => void;
  onSaveMaterial: (session: StudioSessionState) => Promise<StudyMaterial>;
  onRecordQuizScore: (savedId: string, score: number, total: number) => Promise<void>;
  onNavigateDiscover: () => void;
  onNavigateAuth: () => void;
}

type StudioTab = "notes" | "quiz" | "flashcards" | "tutor";

const TOP_INDIAN_LANGUAGES: Array<{ name: string; native: string }> = [
  { name: "Hindi", native: "हिन्दी" },
  { name: "Bengali", native: "বাংলা" },
  { name: "Marathi", native: "मराठी" },
  { name: "Telugu", native: "తెలుగు" },
  { name: "Tamil", native: "தமிழ்" },
  { name: "Gujarati", native: "ગુજરાતી" },
  { name: "Kannada", native: "ಕನ್ನಡ" },
];

const EXTRA_LANGUAGE_SUGGESTIONS = [
  "Urdu",
  "Malayalam",
  "Punjabi",
  "Odia",
  "Assamese",
  "Sanskrit",
  "Spanish",
  "French",
  "German",
  "Japanese",
  "Arabic",
];

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

export function StudyStudioView({
  user,
  session,
  onUpdateSession,
  onSaveMaterial,
  onRecordQuizScore,
  onNavigateDiscover,
  onNavigateAuth,
}: StudyStudioViewProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("notes");
  const [transcriptMode, setTranscriptMode] = useState<"segments" | "editor">("editor");
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [seekSeconds, setSeekSeconds] = useState<number>(0);

  const [quickUrl, setQuickUrl] = useState("");
  const [loadingQuickUrl, setLoadingQuickUrl] = useState(false);

  const [fetchingTranscript, setFetchingTranscript] = useState(false);
  const [aiTranscribing, setAiTranscribing] = useState(false);
  const [transcriptNotice, setTranscriptNotice] = useState<string | null>(null);

  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<string>("Original");
  const [customLanguage, setCustomLanguage] = useState<string>("");
  const [translatingLanguage, setTranslatingLanguage] = useState<string | null>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [notesByLanguage, setNotesByLanguage] = useState<
    Record<string, { notes: StructuredNotes; notesMarkdown: string }>
  >({});

  const [questionCount, setQuestionCount] = useState<number>(5);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const [generatingCards, setGeneratingCards] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [masteredIds, setMasteredIds] = useState<Record<string, boolean>>({});

  const [tutorQuestion, setTutorQuestion] = useState("");
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [tutorThread, setTutorThread] = useState<Array<{ q: string; a: string }>>([]);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  useEffect(() => {
    setSeekSeconds(0);
    setSelectedAnswers({});
    setQuizSubmitted(false);
    setCardIndex(0);
    setCardFlipped(false);
    setMasteredIds({});
    setTutorThread([]);
    setNotesError(null);
    setQuizError(null);
    setCardsError(null);
    setTutorError(null);
    setSaveMessage(null);
    setSaveError(null);
    setTranscriptNotice(null);
    setActiveLanguage("Original");
    setCustomLanguage("");
    setTranslateError(null);
    setNotesByLanguage({});
    setTranscriptMode(session.segments.length > 0 ? "segments" : "editor");
  }, [session.video?.videoId]);

  const filteredSegments = useMemo(() => {
    const q = transcriptSearch.trim().toLowerCase();
    if (!q) return session.segments;
    return session.segments.filter((s) => s.text.toLowerCase().includes(q));
  }, [session.segments, transcriptSearch]);

  const wordCount = useMemo(() => {
    const trimmed = session.transcript.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [session.transcript]);

  async function handleFetchTranscript(videoId: string) {
    setFetchingTranscript(true);
    setTranscriptNotice(null);
    try {
      const res = await fetchVideoTranscript(videoId);
      if (res.transcriptAvailable && res.transcriptText) {
        onUpdateSession((prev) => ({
          ...prev,
          transcript: res.transcriptText,
          segments: res.segments,
        }));
        setTranscriptMode(res.segments.length > 0 ? "segments" : "editor");
      } else {
        setTranscriptMode("editor");
        setTranscriptNotice(
          res.message ||
            "Automatic captions are unavailable for this video. Paste your transcript below."
        );
      }
    } catch (err) {
      setTranscriptMode("editor");
      setTranscriptNotice(
        err instanceof Error ? err.message : "Could not load automatic captions."
      );
    } finally {
      setFetchingTranscript(false);
    }
  }

  async function handleQuickLoadVideo(e: FormEvent) {
    e.preventDefault();
    const clean = quickUrl.trim();
    if (!clean) return;
    setLoadingQuickUrl(true);
    setTranscriptNotice(null);

    try {
      const res = await searchYouTubeVideos(clean);
      const first = res.videos[0];
      if (!first) {
        setTranscriptNotice("No video found for that link or topic.");
        return;
      }
      onUpdateSession(() => ({
        video: first,
        transcript: "",
        segments: [],
        noteStyle: "concise",
        notes: null,
        notesMarkdown: "",
        quiz: [],
        flashcards: [],
        lastQuizScore: null,
        lastQuizTotal: null,
      }));
      void handleFetchTranscript(first.videoId);
    } catch (err) {
      setTranscriptNotice(err instanceof Error ? err.message : "Failed to load video.");
    } finally {
      setLoadingQuickUrl(false);
    }
  }

  async function handleAITranscribeVideo() {
    if (!session.video) return;
    setAiTranscribing(true);
    setTranscriptNotice(null);
    try {
      const res = await generateAITranscript({
        videoId: session.video.videoId,
        videoTitle: session.video.title,
        channelTitle: session.video.channelTitle,
        videoDescription: session.video.description,
      });
      onUpdateSession((prev) => ({
        ...prev,
        transcript: res.transcriptText,
      }));
      setTranscriptMode("editor");
      setTranscriptNotice(
        res.method === "video"
          ? "Generated transcript directly from the video stream."
          : "Video captions were restricted; generated a grounded lecture summary you can edit or turn into notes."
      );
    } catch (err) {
      setTranscriptNotice(
        err instanceof Error ? err.message : "Unable to transcribe video automatically."
      );
    } finally {
      setAiTranscribing(false);
    }
  }

  async function handleGenerateNotes() {
    setNotesError(null);
    setTranslateError(null);
    setGeneratingNotes(true);
    try {
      const res = await generateStudyNotes({
        videoId: session.video?.videoId,
        videoTitle: session.video?.title || "Study Session",
        channelTitle: session.video?.channelTitle || "Instructor",
        videoDescription: session.video?.description,
        transcript: session.transcript,
        style: session.noteStyle,
      });
      setActiveLanguage("Original");
      setNotesByLanguage({
        Original: { notes: res.notes, notesMarkdown: res.notesMarkdown },
      });
      onUpdateSession((prev) => ({
        ...prev,
        notes: res.notes,
        notesMarkdown: res.notesMarkdown,
        noteStyle: res.noteStyle,
      }));
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : "Failed to generate study notes.");
    } finally {
      setGeneratingNotes(false);
    }
  }

  async function handleTranslateNotes(language: string) {
    const cleanLang = language.trim();
    if (!cleanLang || !session.notes) return;
    setTranslateError(null);

    if (cleanLang === "Original") {
      const original = notesByLanguage.Original;
      if (original) {
        setActiveLanguage("Original");
        onUpdateSession((prev) => ({
          ...prev,
          notes: original.notes,
          notesMarkdown: original.notesMarkdown,
        }));
      }
      return;
    }

    const cached = notesByLanguage[cleanLang];
    if (cached) {
      setActiveLanguage(cleanLang);
      onUpdateSession((prev) => ({
        ...prev,
        notes: cached.notes,
        notesMarkdown: cached.notesMarkdown,
      }));
      return;
    }

    const baseNotes = notesByLanguage.Original?.notes ?? session.notes;
    const baseMarkdown = notesByLanguage.Original?.notesMarkdown ?? session.notesMarkdown;
    if (!notesByLanguage.Original) {
      setNotesByLanguage((prev) => ({
        ...prev,
        Original: { notes: baseNotes, notesMarkdown: baseMarkdown },
      }));
    }

    setTranslatingLanguage(cleanLang);
    try {
      const res = await translateStudyNotes({
        notes: baseNotes,
        targetLanguage: cleanLang,
      });
      setNotesByLanguage((prev) => ({
        ...prev,
        Original: prev.Original ?? { notes: baseNotes, notesMarkdown: baseMarkdown },
        [cleanLang]: { notes: res.notes, notesMarkdown: res.notesMarkdown },
      }));
      setActiveLanguage(cleanLang);
      onUpdateSession((prev) => ({
        ...prev,
        notes: res.notes,
        notesMarkdown: res.notesMarkdown,
      }));
    } catch (err) {
      setTranslateError(
        err instanceof Error ? err.message : `Failed to translate notes into ${cleanLang}.`
      );
    } finally {
      setTranslatingLanguage(null);
    }
  }

  async function handleGenerateQuiz() {
    setQuizError(null);
    setGeneratingQuiz(true);
    try {
      const res = await generateStudyQuiz({
        videoId: session.video?.videoId,
        videoTitle: session.video?.title || "Study Session",
        channelTitle: session.video?.channelTitle,
        videoDescription: session.video?.description,
        transcript: session.transcript,
        notesMarkdown: session.notesMarkdown,
        questionCount,
      });
      setSelectedAnswers({});
      setQuizSubmitted(false);
      onUpdateSession((prev) => ({
        ...prev,
        quiz: res.quiz,
      }));
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : "Failed to generate quiz.");
    } finally {
      setGeneratingQuiz(false);
    }
  }

  async function handleSubmitQuiz() {
    if (session.quiz.length === 0) return;
    let score = 0;
    for (const q of session.quiz) {
      if (selectedAnswers[q.id] === q.correctIndex) {
        score += 1;
      }
    }
    setQuizSubmitted(true);
    const total = session.quiz.length;
    onUpdateSession((prev) => ({
      ...prev,
      lastQuizScore: score,
      lastQuizTotal: total,
    }));

    if (user && session.savedId) {
      try {
        await onRecordQuizScore(session.savedId, score, total);
      } catch {
        // Non-blocking score sync
      }
    }
  }

  async function handleGenerateFlashcards() {
    setCardsError(null);
    setGeneratingCards(true);
    try {
      const res = await generateStudyFlashcards({
        videoId: session.video?.videoId,
        videoTitle: session.video?.title || "Study Session",
        channelTitle: session.video?.channelTitle,
        videoDescription: session.video?.description,
        transcript: session.transcript,
        notesMarkdown: session.notesMarkdown,
        cardCount: 8,
      });
      setCardIndex(0);
      setCardFlipped(false);
      setMasteredIds({});
      onUpdateSession((prev) => ({
        ...prev,
        flashcards: res.flashcards,
      }));
    } catch (err) {
      setCardsError(err instanceof Error ? err.message : "Failed to generate flashcards.");
    } finally {
      setGeneratingCards(false);
    }
  }

  async function handleAskTutor(e: FormEvent) {
    e.preventDefault();
    const clean = tutorQuestion.trim();
    if (!clean) return;
    setTutorError(null);
    setTutorLoading(true);
    try {
      const res = await askLessonTutor({
        videoId: session.video?.videoId,
        videoTitle: session.video?.title || "Study Session",
        channelTitle: session.video?.channelTitle,
        videoDescription: session.video?.description,
        transcript: session.transcript,
        notesMarkdown: session.notesMarkdown,
        question: clean,
      });
      setTutorThread((prev) => [...prev, { q: clean, a: res.answer }]);
      setTutorQuestion("");
    } catch (err) {
      setTutorError(err instanceof Error ? err.message : "Failed to answer question.");
    } finally {
      setTutorLoading(false);
    }
  }

  async function handleSaveToLibrary() {
    if (!user) {
      onNavigateAuth();
      return;
    }
    if (!session.video) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const saved = await onSaveMaterial(session);
      onUpdateSession((prev) => ({
        ...prev,
        savedId: saved.id,
      }));
      setSaveMessage("Saved to library");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save study material.");
    } finally {
      setSaving(false);
    }
  }

  if (!session.video) {
    return (
      <main className="mx-auto max-w-[960px] px-6 py-14">
        <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-10 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Open a video in Study Studio
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Paste any YouTube video URL below to start watching and generating AI notes, or browse
            educational topics in Discover.
          </p>

          <form onSubmit={handleQuickLoadVideo} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              placeholder="Paste YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
              aria-label="YouTube URL"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={loadingQuickUrl || !quickUrl.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {loadingQuickUrl && <Loader2 className="h-4 w-4 animate-spin" />}
              Load Video
            </button>
          </form>

          {transcriptNotice && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{transcriptNotice}</p>
          )}

          <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
            <button
              type="button"
              onClick={onNavigateDiscover}
              className="text-sm font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400 cursor-pointer"
            >
              Browse YouTube topics in Discover →
            </button>
          </div>
        </div>
      </main>
    );
  }

  const video = session.video;
  const embedSrc = `https://www.youtube.com/embed/${encodeURIComponent(
    video.videoId
  )}?start=${seekSeconds}&autoplay=${seekSeconds > 0 ? 1 : 0}&rel=0&modestbranding=1`;

  const answeredCount = session.quiz.filter((q) => selectedAnswers[q.id] !== undefined).length;
  const currentCard = session.flashcards[cardIndex];
  const masteredCount = Object.values(masteredIds).filter(Boolean).length;

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-6">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Left Zone: Embedded YouTube Player + Transcript */}
        <section className="space-y-6 lg:col-span-6">
          <div className="no-print overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="aspect-video w-full bg-slate-950">
              <iframe
                key={`${video.videoId}-${seekSeconds}`}
                src={embedSrc}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>

            <div className="p-5">
              <h1 className="font-display text-xl font-bold leading-snug text-slate-900 dark:text-slate-100">
                {video.title}
              </h1>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {video.channelTitle}
                {video.duration ? ` · ${video.duration}` : ""}
                {video.viewCount ? ` · ${video.viewCount}` : ""}
              </p>
            </div>
          </div>

          <div className="no-print rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Video Transcript
                </h2>
                <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {wordCount} words
                  {session.segments.length > 0
                    ? ` · ${session.segments.length} timestamped lines`
                    : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {session.segments.length > 0 && (
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setTranscriptMode("segments")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap cursor-pointer ${
                        transcriptMode === "segments"
                          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Timestamps
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranscriptMode("editor")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap cursor-pointer ${
                        transcriptMode === "editor"
                          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Edit Text
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  disabled={fetchingTranscript}
                  onClick={() => void handleFetchTranscript(video.videoId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {fetchingTranscript && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {session.segments.length > 0 ? "Refresh Captions" : "Fetch Captions"}
                </button>

                <button
                  type="button"
                  disabled={aiTranscribing}
                  onClick={() => void handleAITranscribeVideo()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-60 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-blue-400 dark:hover:bg-slate-800"
                >
                  {aiTranscribing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI Transcribe
                </button>
              </div>
            </div>

            {transcriptNotice && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                {transcriptNotice}
              </div>
            )}

            {transcriptMode === "segments" && session.segments.length > 0 ? (
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder="Search inside transcript..."
                  aria-label="Search inside transcript"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                />
                <div className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto pr-1 dark:divide-slate-800">
                  {filteredSegments.map((seg, idx) => (
                    <button
                      key={`${seg.offset}-${idx}`}
                      type="button"
                      onClick={() => setSeekSeconds(Math.floor(seg.offset / 1000))}
                      className="flex w-full items-start gap-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                    >
                      <span className="mt-0.5 w-12 shrink-0 font-mono text-xs font-medium text-blue-700 tabular-nums dark:text-blue-400">
                        {formatTimestamp(seg.offset)}
                      </span>
                      <span className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {seg.text}
                      </span>
                    </button>
                  ))}
                  {filteredSegments.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-500">
                      No transcript lines match "{transcriptSearch}".
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <textarea
                  value={session.transcript}
                  onChange={(e) =>
                    onUpdateSession((prev) => ({
                      ...prev,
                      transcript: e.target.value,
                    }))
                  }
                  rows={10}
                  placeholder="Paste the video transcript or lecture notes here, then generate AI study notes, quizzes, or flashcards..."
                  aria-label="Video transcript text"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        </section>

        {/* Right Zone: AI Study Notes, Practice Quiz, Flashcards, Lesson Q&A */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab("notes")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "notes"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Notes
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("quiz")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "quiz"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Quiz
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("flashcards")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "flashcards"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Flashcards
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tutor")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === "tutor"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Ask Tutor
              </button>
            </div>

            <div className="flex items-center gap-2">
              {session.notes && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((open) => !open)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {exportingFormat ? `Saving ${exportingFormat}...` : "Save to Device"}
                  </button>

                  {exportMenuOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <button
                        type="button"
                        onClick={() => {
                          setExportMenuOpen(false);
                          if (!session.notes) return;
                          downloadNotesAsPdf(session.notes, {
                            filenameBase: video.title,
                            channelTitle: video.channelTitle,
                            language: activeLanguage,
                          });
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span>Save as PDF</span>
                        <span className="font-mono text-[11px] text-slate-500">.pdf</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setExportMenuOpen(false);
                          if (!session.notes) return;
                          setExportingFormat("Word");
                          try {
                            await downloadNotesAsWord(session.notes, {
                              filenameBase: video.title,
                              channelTitle: video.channelTitle,
                              language: activeLanguage,
                            });
                          } finally {
                            setExportingFormat(null);
                          }
                        }}
                        className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span>Save as Word</span>
                        <span className="font-mono text-[11px] text-slate-500">.docx</span>
                      </button>
                      {session.notesMarkdown && (
                        <button
                          type="button"
                          onClick={() => {
                            setExportMenuOpen(false);
                            downloadMarkdownFile(`${video.title}-notes`, session.notesMarkdown);
                          }}
                          className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <span>Save as Markdown</span>
                          <span className="font-mono text-[11px] text-slate-500">.md</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setExportMenuOpen(false);
                          window.print();
                        }}
                        className="flex w-full items-center justify-between border-t border-slate-100 px-3.5 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span>Print Page</span>
                        <Printer className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveToLibrary()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saveMessage ? (
                  <BookmarkCheck className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <BookmarkPlus className="h-3.5 w-3.5" />
                )}
                {user ? (saveMessage ? "Saved" : "Save to Library") : "Sign In to Save"}
              </button>
            </div>
          </div>

          {saveError && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              {saveError}
            </div>
          )}

          {/* TAB 1: AI STUDY NOTES */}
          {activeTab === "notes" && (
            <div className="mt-5">
              <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  {(
                    [
                      { id: "concise", label: "Concise" },
                      { id: "detailed", label: "Detailed" },
                      { id: "simplified", label: "Simplified" },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() =>
                        onUpdateSession((prev) => ({
                          ...prev,
                          noteStyle: st.id,
                        }))
                      }
                      className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                        session.noteStyle === st.id
                          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={generatingNotes || (!video.videoId && wordCount < 5)}
                  onClick={() => void handleGenerateNotes()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {generatingNotes ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {session.notes ? "Regenerate Notes" : "Generate Notes"}
                </button>
              </div>

              {notesError && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  {notesError}
                </div>
              )}

              {generatingNotes && (
                <div className="mt-8 space-y-4">
                  <div className="h-6 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-20 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
                  <div className="h-32 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
                </div>
              )}

              {!generatingNotes && !session.notes && (
                <div className="mt-8 border-t border-slate-200 py-10 text-center dark:border-slate-800">
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Ready to organize this lecture
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600 dark:text-slate-400">
                    {wordCount < 5
                      ? "No transcript yet? Click Generate Notes anyway to analyze the video directly with AI, or click AI Transcribe / paste text on the left."
                      : "Click Generate Notes above to convert the transcript into a structured study guide."}
                  </p>
                </div>
              )}

              {!generatingNotes && session.notes && (
                <>
                  <div className="no-print mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <Languages className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                        <span>Read notes in another language</span>
                      </div>
                      {translatingLanguage && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Translating to {translatingLanguage}...
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={Boolean(translatingLanguage)}
                        onClick={() => void handleTranslateNotes("Original")}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          activeLanguage === "Original"
                            ? "border-blue-600 bg-blue-700 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        }`}
                      >
                        Original
                      </button>

                      {TOP_INDIAN_LANGUAGES.map((lang) => {
                        const isActive = activeLanguage === lang.name;
                        return (
                          <button
                            key={lang.name}
                            type="button"
                            disabled={Boolean(translatingLanguage)}
                            onClick={() => void handleTranslateNotes(lang.name)}
                            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                              isActive
                                ? "border-blue-600 bg-blue-700 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:text-blue-400"
                            }`}
                          >
                            {lang.name} · {lang.native}
                          </button>
                        );
                      })}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (customLanguage.trim()) {
                          void handleTranslateNotes(customLanguage.trim());
                        }
                      }}
                      className="mt-3 flex items-center gap-2"
                    >
                      <input
                        type="text"
                        list="study-language-suggestions"
                        value={customLanguage}
                        onChange={(e) => setCustomLanguage(e.target.value)}
                        placeholder="Or type any language (e.g. Urdu, Malayalam, Punjabi, Spanish)..."
                        aria-label="Translate notes into any language"
                        className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <datalist id="study-language-suggestions">
                        {EXTRA_LANGUAGE_SUGGESTIONS.map((lang) => (
                          <option key={lang} value={lang} />
                        ))}
                      </datalist>
                      <button
                        type="submit"
                        disabled={!customLanguage.trim() || Boolean(translatingLanguage)}
                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Translate
                      </button>
                    </form>

                    {translateError && (
                      <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
                        {translateError}
                      </p>
                    )}
                  </div>

                  <article className="mt-6 divide-y divide-slate-200 dark:divide-slate-800">
                  <div className="pb-6">
                    <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {session.notes.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {session.notes.summary}
                    </p>
                  </div>

                  {session.notes.keyConcepts.length > 0 && (
                    <div className="py-6">
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                        Key Concepts
                      </h3>
                      <div className="mt-4 space-y-4">
                        {session.notes.keyConcepts.map((concept, idx) => (
                          <div key={idx}>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {concept.heading}
                            </h4>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                              {concept.explanation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {session.notes.structuredOutline.length > 0 && (
                    <div className="py-6">
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                        Structured Study Outline
                      </h3>
                      <div className="mt-4 space-y-5">
                        {session.notes.structuredOutline.map((section, idx) => (
                          <div key={idx}>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              <span className="mr-2 font-mono text-xs text-blue-700 tabular-nums dark:text-blue-400">
                                {String(idx + 1).padStart(2, "0")}.
                              </span>
                              {section.sectionTitle}
                            </h4>
                            <ul className="mt-2 list-disc space-y-1.5 pl-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                              {section.points.map((pt, pIdx) => (
                                <li key={pIdx}>{pt}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {session.notes.keyTerms.length > 0 && (
                    <div className="py-6">
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                        Key Terms & Definitions
                      </h3>
                      <dl className="mt-4 space-y-3">
                        {session.notes.keyTerms.map((item, idx) => (
                          <div key={idx} className="text-sm leading-relaxed">
                            <dt className="inline font-semibold text-slate-900 dark:text-slate-100">
                              {item.term}:{" "}
                            </dt>
                            <dd className="inline text-slate-600 dark:text-slate-300">
                              {item.definition}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  {session.notes.takeaways.length > 0 && (
                    <div className="pt-6">
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                        Exam & Revision Takeaways
                      </h3>
                      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {session.notes.takeaways.map((tk, idx) => (
                          <li key={idx}>{tk}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
                </>
              )}
            </div>
          )}

          {/* TAB 2: PRACTICE QUIZ */}
          {activeTab === "quiz" && (
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="quiz-count"
                    className="text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Questions:
                  </label>
                  <div id="quiz-count" className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    {[5, 8, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setQuestionCount(num)}
                        className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium tabular-nums cursor-pointer ${
                          questionCount === num
                            ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                            : "text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {session.quiz.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          downloadQuizAsPdf(session.quiz, video.title, video.channelTitle)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadQuizAsWord(session.quiz, video.title, video.channelTitle)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Word
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    disabled={generatingQuiz || (!video.videoId && wordCount < 5 && !session.notesMarkdown)}
                    onClick={() => void handleGenerateQuiz()}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {generatingQuiz ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {session.quiz.length > 0 ? "New Quiz" : "Generate Quiz"}
                  </button>
                </div>
              </div>

              {quizError && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  {quizError}
                </div>
              )}

              {generatingQuiz && (
                <div className="mt-8 space-y-4">
                  <div className="h-16 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  <div className="h-16 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                </div>
              )}

              {!generatingQuiz && session.quiz.length === 0 && (
                <div className="mt-8 border-t border-slate-200 py-10 text-center dark:border-slate-800">
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Test your understanding
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600 dark:text-slate-400">
                    Generate a multiple-choice quiz directly from the video transcript or your study
                    notes.
                  </p>
                </div>
              )}

              {!generatingQuiz && session.quiz.length > 0 && (
                <div className="mt-6">
                  {quizSubmitted && session.lastQuizScore !== null && session.lastQuizTotal !== null && (
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Quiz Result
                        </p>
                        <p className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                          {session.lastQuizScore} / {session.lastQuizTotal} (
                          {Math.round((session.lastQuizScore / session.lastQuizTotal) * 100)}%)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAnswers({});
                          setQuizSubmitted(false);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Retake Quiz
                      </button>
                    </div>
                  )}

                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {session.quiz.map((q, qIdx) => {
                      const chosen = selectedAnswers[q.id];
                      const isCorrect = chosen === q.correctIndex;

                      return (
                        <div key={q.id} className="py-5 first:pt-0">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                              <span className="mr-2 font-mono text-xs text-blue-700 tabular-nums dark:text-blue-400">
                                {String(qIdx + 1).padStart(2, "0")}.
                              </span>
                              {q.question}
                            </p>

                            {quizSubmitted && (
                              <span
                                className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${
                                  isCorrect
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-red-700 dark:text-red-400"
                                }`}
                              >
                                {isCorrect ? (
                                  <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    Correct
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-4 w-4" />
                                    Incorrect
                                  </>
                                )}
                              </span>
                            )}
                          </div>

                          <div className="mt-3 space-y-2">
                            {q.options.map((opt, optIdx) => {
                              const isSelected = chosen === optIdx;
                              const isAnswer = q.correctIndex === optIdx;

                              let optionStyle =
                                "border-slate-200 bg-white text-slate-800 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200";
                              if (quizSubmitted) {
                                if (isAnswer) {
                                  optionStyle =
                                    "border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
                                } else if (isSelected && !isAnswer) {
                                  optionStyle =
                                    "border-red-400 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200";
                                }
                              } else if (isSelected) {
                                optionStyle =
                                  "border-blue-600 bg-blue-50 text-blue-950 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-100";
                              }

                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  disabled={quizSubmitted}
                                  onClick={() =>
                                    setSelectedAnswers((prev) => ({
                                      ...prev,
                                      [q.id]: optIdx,
                                    }))
                                  }
                                  className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors cursor-pointer disabled:cursor-default ${optionStyle}`}
                                >
                                  <span className="mt-0.5 font-mono text-xs font-semibold tabular-nums">
                                    {String.fromCharCode(65 + optIdx)}.
                                  </span>
                                  <span>{opt}</span>
                                </button>
                              );
                            })}
                          </div>

                          {quizSubmitted && q.explanation && (
                            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                Explanation:{" "}
                              </span>
                              {q.explanation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!quizSubmitted && (
                    <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
                      <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {answeredCount} / {session.quiz.length} answered
                      </span>
                      <button
                        type="button"
                        disabled={answeredCount < session.quiz.length}
                        onClick={() => void handleSubmitQuiz()}
                        className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                      >
                        Submit Quiz
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FLASHCARDS */}
          {activeTab === "flashcards" && (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {session.flashcards.length > 0
                    ? `Card ${String(cardIndex + 1).padStart(2, "0")} / ${String(
                        session.flashcards.length
                      ).padStart(2, "0")} · ${masteredCount} mastered`
                    : "Active-recall flashcards"}
                </p>
                <button
                  type="button"
                  disabled={generatingCards || (!video.videoId && wordCount < 5 && !session.notesMarkdown)}
                  onClick={() => void handleGenerateFlashcards()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {generatingCards ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {session.flashcards.length > 0 ? "Regenerate Cards" : "Generate Flashcards"}
                </button>
              </div>

              {cardsError && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  {cardsError}
                </div>
              )}

              {!generatingCards && session.flashcards.length === 0 && (
                <div className="mt-8 border-t border-slate-200 py-10 text-center dark:border-slate-800">
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Practice with active recall
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600 dark:text-slate-400">
                    Generate 8 concise question-and-answer flashcards from this video to memorize
                    key definitions and concepts.
                  </p>
                </div>
              )}

              {!generatingCards && currentCard && (
                <div className="mt-6 space-y-4">
                  <button
                    type="button"
                    onClick={() => setCardFlipped((f) => !f)}
                    className="flex min-h-[220px] w-full flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-6 text-left transition-colors hover:border-blue-300 cursor-pointer dark:border-slate-800 dark:bg-slate-950 dark:hover:border-blue-700"
                  >
                    <span className="font-mono text-xs font-medium text-blue-700 dark:text-blue-400">
                      {cardFlipped ? "Answer" : "Prompt"}
                    </span>
                    <p className="my-4 font-display text-lg font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                      {cardFlipped ? currentCard.back : currentCard.front}
                    </p>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Click card to show {cardFlipped ? "prompt" : "answer"}
                    </span>
                  </button>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={cardIndex === 0}
                        onClick={() => {
                          setCardIndex((i) => Math.max(0, i - 1));
                          setCardFlipped(false);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={cardIndex >= session.flashcards.length - 1}
                        onClick={() => {
                          setCardIndex((i) => Math.min(session.flashcards.length - 1, i + 1));
                          setCardFlipped(false);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setMasteredIds((prev) => ({
                          ...prev,
                          [currentCard.id]: !prev[currentCard.id],
                        }))
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        masteredIds[currentCard.id]
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {masteredIds[currentCard.id] ? "Mastered" : "Mark Mastered"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LESSON Q&A TUTOR */}
          {activeTab === "tutor" && (
            <div className="mt-5">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Ask any follow-up question about this video's concepts, formulas, or examples.
              </p>

              <form onSubmit={handleAskTutor} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={tutorQuestion}
                  onChange={(e) => setTutorQuestion(e.target.value)}
                  placeholder="e.g. Can you explain the intuition behind the main theorem?"
                  aria-label="Ask a question about this lesson"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={tutorLoading || !tutorQuestion.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {tutorLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Ask
                </button>
              </form>

              {tutorError && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  {tutorError}
                </div>
              )}

              {tutorThread.length === 0 ? (
                <div className="mt-8 border-t border-slate-200 py-10 text-center dark:border-slate-800">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Ask a question above to get a clear explanation grounded in the lesson.
                  </p>
                </div>
              ) : (
                <div className="mt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 pb-2 dark:border-slate-800">
                    <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {tutorThread.length} {tutorThread.length === 1 ? "answer" : "answers"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          downloadTutorAnswersAsPdf(tutorThread, video.title, video.channelTitle)
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Save All PDF
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadTutorAnswersAsWord(
                            tutorThread,
                            video.title,
                            video.channelTitle
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Save All Word
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {tutorThread.map((item, idx) => (
                      <div key={idx} className="py-4 space-y-2.5">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.q}
                        </p>
                        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {item.a}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Save answer:
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              downloadTutorAnswersAsPdf([item], video.title, video.channelTitle)
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-blue-400"
                          >
                            <Download className="h-3 w-3" />
                            PDF (.pdf)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void downloadTutorAnswersAsWord(
                                [item],
                                video.title,
                                video.channelTitle
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700 whitespace-nowrap cursor-pointer dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-blue-400"
                          >
                            <Download className="h-3 w-3" />
                            Word (.docx)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
