import { Loader2, Moon, Play, Search, Sun } from "lucide-react";
import { useState, type FormEvent } from "react";
import { searchYouTubeVideos } from "../api/client";
import type { UserProfile, YouTubeVideo } from "../types";
import { VideoThumbnail } from "./VideoThumbnail";

interface DiscoverViewProps {
  user: UserProfile | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSelectVideo: (video: YouTubeVideo) => void;
}

const STARTER_TOPICS = [
  "MIT Linear Algebra",
  "Organic Chemistry Mechanisms",
  "Neural Networks Explained",
  "Macroeconomics Supply Demand",
  "Cellular Respiration Biology",
];

export function DiscoverView({
  user,
  darkMode,
  onToggleDarkMode,
  onSelectVideo,
}: DiscoverViewProps) {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(searchTerm: string) {
    const clean = searchTerm.trim();
    if (!clean) return;
    setQuery(clean);
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const res = await searchYouTubeVideos(clean);
      setVideos(res.videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search YouTube videos.");
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void runSearch(query);
  }

  return (
    <main className="mx-auto max-w-[1440px] px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance dark:text-slate-100">
            Find a lecture or study video
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            {user ? `Signed in as ${user.name} · ` : ""}
            Search YouTube by topic or paste any YouTube video URL to open it in the Study Studio.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {darkMode ? "Light Mode" : "Dark Mode"}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topic (e.g. Calculus Derivatives) or paste YouTube URL..."
              aria-label="Search YouTube educational videos or paste URL"
              className="w-full rounded-lg border border-slate-300 bg-white py-3 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search Videos
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Suggested topics:
        </span>
        {STARTER_TOPICS.map((topic) => (
          <button
            key={topic}
            type="button"
            onClick={() => void runSearch(topic)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 whitespace-nowrap shrink-0 cursor-pointer dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-400"
          >
            {topic}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="aspect-video w-full animate-pulse bg-slate-200 dark:bg-slate-800" />
              <div className="space-y-2.5 p-4">
                <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && hasSearched && videos.length === 0 && !error && (
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            No matching videos found
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Try broader keywords or paste a direct YouTube watch URL into the search bar above.
          </p>
        </div>
      )}

      {!loading && !hasSearched && (
        <div className="mt-10 grid grid-cols-1 gap-6 border-t border-slate-200 pt-8 md:grid-cols-3 dark:border-slate-800">
          <div className="space-y-1.5">
            <span className="font-mono text-xs font-medium text-blue-700 tabular-nums dark:text-blue-400">
              01
            </span>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Search or Paste Link
            </h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Find lectures across math, science, programming, or humanities, or paste any direct
              YouTube URL.
            </p>
          </div>
          <div className="space-y-1.5">
            <span className="font-mono text-xs font-medium text-blue-700 tabular-nums dark:text-blue-400">
              02
            </span>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Notes, Flashcards & Tutor
            </h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Extract captions automatically or paste your own transcript to generate notes,
              flashcards, and Q&A answers.
            </p>
          </div>
          <div className="space-y-1.5">
            <span className="font-mono text-xs font-medium text-blue-700 tabular-nums dark:text-blue-400">
              03
            </span>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Test & Save Progress
            </h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Take instant multiple-choice quizzes with detailed explanations and store guides in
              your personal library.
            </p>
          </div>
        </div>
      )}

      {!loading && videos.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <article
              key={video.videoId}
              className="group flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div>
                <VideoThumbnail
                  src={video.thumbnailUrl}
                  alt={video.title}
                  duration={video.duration}
                />
                <div className="p-4">
                  <h2 className="line-clamp-2 font-display text-base font-semibold leading-snug text-slate-900 dark:text-slate-100">
                    {video.title}
                  </h2>
                  <p className="mt-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {video.channelTitle}
                    {video.viewCount ? ` · ${video.viewCount}` : ""}
                  </p>
                  {video.description && (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {video.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onSelectVideo(video)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap cursor-pointer dark:bg-slate-800 dark:hover:bg-blue-700"
                >
                  <Play className="h-3.5 w-3.5" />
                  Open in Study Studio
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
