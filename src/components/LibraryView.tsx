import { BookOpen, Download, Loader2, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { StudyMaterial, UserProfile } from "../types";
import {
  downloadMarkdownFile,
  downloadNotesAsPdf,
  downloadNotesAsWord,
} from "../utils/exportDocument";
import { VideoThumbnail } from "./VideoThumbnail";

interface LibraryViewProps {
  user: UserProfile | null;
  materials: StudyMaterial[];
  loading: boolean;
  onOpenMaterial: (material: StudyMaterial) => void;
  onDeleteMaterial: (id: string) => Promise<void>;
  onNavigateAuth: () => void;
  onNavigateDiscover: () => void;
}

export function LibraryView({
  user,
  materials,
  loading,
  onOpenMaterial,
  onDeleteMaterial,
  onNavigateAuth,
  onNavigateDiscover,
}: LibraryViewProps) {
  const [filter, setFilter] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportOpenId, setExportOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.videoTitle.toLowerCase().includes(q) ||
        m.channelTitle.toLowerCase().includes(q) ||
        (m.notes?.title ?? "").toLowerCase().includes(q)
    );
  }, [materials, filter]);

  if (!user) {
    return (
      <main className="mx-auto max-w-[900px] px-6 py-16 text-center">
        <div className="rounded-xl border border-slate-200 bg-white p-10 dark:border-slate-800 dark:bg-slate-900">
          <BookOpen className="mx-auto h-8 w-8 text-blue-700 dark:text-blue-400" />
          <h1 className="mt-4 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Sign in to view your Saved Library
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
            Your generated study notes, flashcards, and quiz scores are stored securely in your
            student account.
          </p>
          <button
            type="button"
            onClick={onNavigateAuth}
            className="mt-6 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 cursor-pointer"
          >
            Sign In or Create Account
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-8">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end dark:border-slate-800">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Saved Study Library
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {materials.length} {materials.length === 1 ? "study guide" : "study guides"} saved for{" "}
            {user.name}
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter saved notes..."
            aria-label="Filter saved study guides"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3.5 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex items-center justify-center gap-2 py-12 text-sm text-slate-600 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your study library...
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            {materials.length === 0
              ? "No saved study guides yet"
              : "No saved study guides match your search"}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            {materials.length === 0
              ? "Search for an educational video in Discover, generate notes or a quiz, and click Save to Library."
              : "Try clearing your filter query to view all saved study guides."}
          </p>
          {materials.length === 0 && (
            <button
              type="button"
              onClick={onNavigateDiscover}
              className="mt-5 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 cursor-pointer"
            >
              Browse Educational Videos
            </button>
          )}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const updatedDate = new Date(item.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const hasScore =
              item.lastQuizScore !== null &&
              item.lastQuizTotal !== null &&
              item.lastQuizTotal > 0;

            return (
              <article
                key={item.id}
                className="group flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <VideoThumbnail src={item.thumbnailUrl} alt={item.videoTitle} />
                  <div className="p-4">
                    <h2 className="line-clamp-2 font-display text-base font-semibold leading-snug text-slate-900 dark:text-slate-100">
                      {item.notes?.title || item.videoTitle}
                    </h2>
                    <p className="mt-1.5 truncate text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {item.channelTitle} · Saved {updatedDate}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 tabular-nums dark:text-slate-400">
                      {item.notes ? "Notes ready" : "Transcript only"}
                      {" · "}
                      {item.quiz.length > 0 ? `${item.quiz.length} quiz questions` : "No quiz"}
                      {hasScore ? ` · Last score ${item.lastQuizScore}/${item.lastQuizTotal}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => onOpenMaterial(item)}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap cursor-pointer dark:bg-slate-800 dark:hover:bg-blue-700"
                  >
                    Open in Studio
                  </button>

                  <div className="flex items-center gap-1.5">
                    {(item.notes || item.notesMarkdown) && (
                      <div className="relative">
                        <button
                          type="button"
                          aria-label="Save study notes to device"
                          onClick={() =>
                            setExportOpenId((prev) => (prev === item.id ? null : item.id))
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Save
                        </button>

                        {exportOpenId === item.id && (
                          <div className="absolute right-0 bottom-full z-20 mb-2 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                            {item.notes && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExportOpenId(null);
                                    downloadNotesAsPdf(item.notes!, {
                                      filenameBase: item.videoTitle,
                                      channelTitle: item.channelTitle,
                                    });
                                  }}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  <span>Save as PDF</span>
                                  <span className="font-mono text-[11px] text-slate-500">.pdf</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExportOpenId(null);
                                    void downloadNotesAsWord(item.notes!, {
                                      filenameBase: item.videoTitle,
                                      channelTitle: item.channelTitle,
                                    });
                                  }}
                                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  <span>Save as Word</span>
                                  <span className="font-mono text-[11px] text-slate-500">.docx</span>
                                </button>
                              </>
                            )}
                            {item.notesMarkdown && (
                              <button
                                type="button"
                                onClick={() => {
                                  setExportOpenId(null);
                                  downloadMarkdownFile(item.videoTitle, item.notesMarkdown);
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                <span>Markdown</span>
                                <span className="font-mono text-[11px] text-slate-500">.md</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deletingId === item.id}
                          onClick={async () => {
                            setDeletingId(item.id);
                            try {
                              await onDeleteMaterial(item.id);
                            } finally {
                              setDeletingId(null);
                              setConfirmDeleteId(null);
                            }
                          }}
                          className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer dark:border-slate-700 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label="Delete saved study material"
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 cursor-pointer dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-900 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
