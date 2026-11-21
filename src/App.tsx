import { useCallback, useEffect, useState } from "react";
import {
  deleteSavedMaterial,
  fetchCurrentUser,
  fetchVideoTranscript,
  listSavedMaterials,
  logoutStudent,
  saveStudyMaterial,
  updateSavedQuizScore,
} from "./api/client";
import { AuthView } from "./components/AuthView";
import { DiscoverView } from "./components/DiscoverView";
import { LibraryView } from "./components/LibraryView";
import {
  StudyStudioView,
  type StudioSessionState,
} from "./components/StudyStudioView";
import { TopBar, type AppView } from "./components/TopBar";
import type { StudyMaterial, UserProfile, YouTubeVideo } from "./types";

const EMPTY_STUDIO_SESSION: StudioSessionState = {
  video: null,
  transcript: "",
  segments: [],
  noteStyle: "concise",
  notes: null,
  notesMarkdown: "",
  quiz: [],
  flashcards: [],
  lastQuizScore: null,
  lastQuizTotal: null,
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("discover");
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("studymate_theme") === "dark";
    } catch {
      return false;
    }
  });

  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [studioSession, setStudioSession] = useState<StudioSessionState>(EMPTY_STUDIO_SESSION);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
      localStorage.setItem("studymate_theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("studymate_theme", "light");
    }
  }, [darkMode]);

  const loadMaterials = useCallback(async () => {
    setLoadingMaterials(true);
    try {
      const list = await listSavedMaterials();
      setMaterials(list);
    } catch {
      setMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((u) => {
        if (!active) return;
        setUser(u);
        if (u) {
          void loadMaterials();
        }
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, [loadMaterials]);

  async function handleSelectVideo(video: YouTubeVideo) {
    setStudioSession({
      video,
      transcript: "",
      segments: [],
      noteStyle: "concise",
      notes: null,
      notesMarkdown: "",
      quiz: [],
      flashcards: [],
      lastQuizScore: null,
      lastQuizTotal: null,
    });
    setActiveView("studio");

    try {
      const res = await fetchVideoTranscript(video.videoId);
      if (res.transcriptAvailable && res.transcriptText) {
        setStudioSession((prev) =>
          prev.video?.videoId === video.videoId
            ? {
                ...prev,
                transcript: res.transcriptText,
                segments: res.segments,
              }
            : prev
        );
      }
    } catch {
      // User can manually click Fetch Transcript or paste transcript in Studio
    }
  }

  function handleOpenSavedMaterial(material: StudyMaterial) {
    setStudioSession({
      savedId: material.id,
      video: {
        videoId: material.videoId,
        title: material.videoTitle,
        channelTitle: material.channelTitle,
        description: "",
        thumbnailUrl: material.thumbnailUrl,
        publishedAt: material.createdAt,
      },
      transcript: material.transcript,
      segments: [],
      noteStyle: material.noteStyle,
      notes: material.notes,
      notesMarkdown: material.notesMarkdown,
      quiz: material.quiz,
      flashcards: material.flashcards ?? [],
      lastQuizScore: material.lastQuizScore,
      lastQuizTotal: material.lastQuizTotal,
    });
    setActiveView("studio");
  }

  async function handleSaveMaterial(current: StudioSessionState): Promise<StudyMaterial> {
    if (!current.video) {
      throw new Error("No video selected.");
    }
    const saved = await saveStudyMaterial({
      id: current.savedId,
      videoId: current.video.videoId,
      videoTitle: current.video.title,
      channelTitle: current.video.channelTitle,
      thumbnailUrl: current.video.thumbnailUrl,
      transcript: current.transcript,
      noteStyle: current.noteStyle,
      notes: current.notes,
      notesMarkdown: current.notesMarkdown,
      quiz: current.quiz,
      flashcards: current.flashcards,
      lastQuizScore: current.lastQuizScore,
      lastQuizTotal: current.lastQuizTotal,
    });

    setMaterials((prev) => {
      const exists = prev.some((m) => m.id === saved.id);
      if (exists) {
        return prev.map((m) => (m.id === saved.id ? saved : m));
      }
      return [saved, ...prev];
    });
    return saved;
  }

  async function handleRecordQuizScore(savedId: string, score: number, total: number) {
    const updated = await updateSavedQuizScore(savedId, score, total);
    setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  async function handleDeleteMaterial(id: string) {
    await deleteSavedMaterial(id);
    setMaterials((prev) => prev.filter((m) => m.id !== id));
    if (studioSession.savedId === id) {
      setStudioSession((prev) => ({ ...prev, savedId: undefined }));
    }
  }

  async function handleLogout() {
    await logoutStudent();
    setUser(null);
    setMaterials([]);
    setActiveView("discover");
  }

  function handleAuthSuccess(loggedInUser: UserProfile) {
    setUser(loggedInUser);
    void loadMaterials();
    setActiveView(studioSession.video ? "studio" : "discover");
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        Loading AI StudyMate...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TopBar
        activeView={activeView}
        onNavigate={setActiveView}
        user={user}
        onLogout={() => void handleLogout()}
      />

      {activeView === "auth" && (
        <AuthView
          onSuccess={handleAuthSuccess}
          onContinueAsGuest={() => setActiveView("discover")}
        />
      )}

      {activeView === "discover" && (
        <DiscoverView
          user={user}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
          onSelectVideo={(video) => void handleSelectVideo(video)}
        />
      )}

      {activeView === "studio" && (
        <StudyStudioView
          user={user}
          session={studioSession}
          onUpdateSession={setStudioSession}
          onSaveMaterial={handleSaveMaterial}
          onRecordQuizScore={handleRecordQuizScore}
          onNavigateDiscover={() => setActiveView("discover")}
          onNavigateAuth={() => setActiveView("auth")}
        />
      )}

      {activeView === "library" && (
        <LibraryView
          user={user}
          materials={materials}
          loading={loadingMaterials}
          onOpenMaterial={handleOpenSavedMaterial}
          onDeleteMaterial={handleDeleteMaterial}
          onNavigateAuth={() => setActiveView("auth")}
          onNavigateDiscover={() => setActiveView("discover")}
        />
      )}
    </div>
  );
}
