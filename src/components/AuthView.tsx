import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { loginStudent, registerStudent } from "../api/client";
import type { UserProfile } from "../types";

interface AuthViewProps {
  onSuccess: (user: UserProfile) => void;
  onContinueAsGuest: () => void;
}

export function AuthView({ onSuccess, onContinueAsGuest }: AuthViewProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await registerStudent({ name, email, password });
        onSuccess(res.user);
      } else {
        const res = await loginStudent({ email, password });
        onSuccess(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1200px] px-6 py-12 lg:py-16">
      <div className="grid grid-cols-1 items-stretch gap-12 lg:grid-cols-12">
        <div className="flex flex-col justify-between lg:col-span-7">
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              Student Study Workspace
            </p>
            <h1 className="mt-3 max-w-xl font-display text-4xl font-bold tracking-tight text-slate-900 text-balance sm:text-5xl dark:text-slate-100">
              Turn educational videos into structured study guides
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Search YouTube lectures by topic, watch inside a distraction-free player, generate
              organized study notes from transcripts, and test retention with adaptive quizzes.
            </p>
          </div>

          <div className="mt-10 divide-y divide-slate-200 border-t border-b border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            <div className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-12 sm:items-baseline">
              <span className="font-mono text-xs font-medium text-slate-500 tabular-nums sm:col-span-2 dark:text-slate-400">
                01
              </span>
              <span className="text-sm font-semibold text-slate-900 sm:col-span-4 dark:text-slate-100">
                Video Discovery & Playback
              </span>
              <span className="text-sm text-slate-600 sm:col-span-6 dark:text-slate-400">
                Search lectures or paste any YouTube link and study alongside timestamped captions.
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-12 sm:items-baseline">
              <span className="font-mono text-xs font-medium text-slate-500 tabular-nums sm:col-span-2 dark:text-slate-400">
                02
              </span>
              <span className="text-sm font-semibold text-slate-900 sm:col-span-4 dark:text-slate-100">
                Structured AI Study Notes
              </span>
              <span className="text-sm text-slate-600 sm:col-span-6 dark:text-slate-400">
                Convert transcripts into summaries, key concepts, definitions, and exam outlines.
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-12 sm:items-baseline">
              <span className="font-mono text-xs font-medium text-slate-500 tabular-nums sm:col-span-2 dark:text-slate-400">
                03
              </span>
              <span className="text-sm font-semibold text-slate-900 sm:col-span-4 dark:text-slate-100">
                Practice Quizzes & Library
              </span>
              <span className="text-sm text-slate-600 sm:col-span-6 dark:text-slate-400">
                Check comprehension immediately and save every guide to your personal account.
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className={`rounded-md py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === "login"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className={`rounded-md py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === "register"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                Create Account
              </button>
            </div>

            <h2 className="mt-6 font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {mode === "login" ? "Welcome back" : "Create your student account"}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {mode === "login"
                ? "Sign in to access your saved study guides and quiz history."
                : "Register to save AI study notes and quizzes across sessions."}
            </p>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {mode === "register" && (
                <div>
                  <label
                    htmlFor="student-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Full Name
                  </label>
                  <input
                    id="student-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="student-email"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Email Address
                </label>
                <input
                  id="student-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@university.edu"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="student-password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="student-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "At least 6 characters" : "Enter password"}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-5 text-center dark:border-slate-800">
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="text-xs font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
              >
                Explore videos and study tools without signing in
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
