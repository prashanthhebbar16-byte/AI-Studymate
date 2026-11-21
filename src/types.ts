export interface UserProfile {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration?: string;
  viewCount?: string;
}

export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

export type NoteStyle = "concise" | "detailed" | "simplified";

export interface StructuredNotes {
  title: string;
  summary: string;
  keyConcepts: Array<{
    heading: string;
    explanation: string;
  }>;
  structuredOutline: Array<{
    sectionTitle: string;
    points: string[];
  }>;
  keyTerms: Array<{
    term: string;
    definition: string;
  }>;
  takeaways: string[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface StudyMaterial {
  id: string;
  userId: string;
  videoId: string;
  videoTitle: string;
  channelTitle: string;
  thumbnailUrl: string;
  transcript: string;
  noteStyle: NoteStyle;
  notes: StructuredNotes | null;
  notesMarkdown: string;
  quiz: QuizQuestion[];
  flashcards: Flashcard[];
  lastQuizScore: number | null;
  lastQuizTotal: number | null;
  createdAt: string;
  updatedAt: string;
}
