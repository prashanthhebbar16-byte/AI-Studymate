import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import type {
  Flashcard,
  NoteStyle,
  QuizQuestion,
  StructuredNotes,
  StudyMaterial,
  UserProfile,
} from "../src/types.ts";

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

interface LocalStoreShape {
  users: StoredUser[];
  materials: StudyMaterial[];
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
const LOCAL_DB_FILE = path.join(DATA_DIR, "studymate-db.json");

let mongoConnected = false;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const studyMaterialSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    videoId: { type: String, required: true, index: true },
    videoTitle: { type: String, required: true },
    channelTitle: { type: String, default: "YouTube" },
    thumbnailUrl: { type: String, default: "" },
    transcript: { type: String, default: "" },
    noteStyle: { type: String, enum: ["concise", "detailed", "simplified"], default: "concise" },
    notes: { type: mongoose.Schema.Types.Mixed, default: null },
    notesMarkdown: { type: String, default: "" },
    quiz: { type: [mongoose.Schema.Types.Mixed], default: [] },
    flashcards: { type: [mongoose.Schema.Types.Mixed], default: [] },
    lastQuizScore: { type: Number, default: null },
    lastQuizTotal: { type: Number, default: null },
  },
  { timestamps: true }
);

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
const StudyMaterialModel =
  mongoose.models.StudyMaterial || mongoose.model("StudyMaterial", studyMaterialSchema);

function ensureLocalStore(): LocalStoreShape {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    const initial: LocalStoreShape = { users: [], materials: [] };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  try {
    const raw = fs.readFileSync(LOCAL_DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalStoreShape>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      materials: Array.isArray(parsed.materials) ? parsed.materials : [],
    };
  } catch {
    return { users: [], materials: [] };
  }
}

function writeLocalStore(data: LocalStoreShape): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function mapMongoMaterial(doc: Record<string, unknown>): StudyMaterial {
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    videoId: String(doc.videoId ?? ""),
    videoTitle: String(doc.videoTitle ?? ""),
    channelTitle: String(doc.channelTitle ?? "YouTube"),
    thumbnailUrl: String(doc.thumbnailUrl ?? ""),
    transcript: String(doc.transcript ?? ""),
    noteStyle: (doc.noteStyle as NoteStyle) ?? "concise",
    notes: (doc.notes as StructuredNotes | null) ?? null,
    notesMarkdown: String(doc.notesMarkdown ?? ""),
    quiz: Array.isArray(doc.quiz) ? (doc.quiz as QuizQuestion[]) : [],
    flashcards: Array.isArray(doc.flashcards) ? (doc.flashcards as Flashcard[]) : [],
    lastQuizScore: typeof doc.lastQuizScore === "number" ? doc.lastQuizScore : null,
    lastQuizTotal: typeof doc.lastQuizTotal === "number" ? doc.lastQuizTotal : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt as string).toISOString() : new Date().toISOString(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string).toISOString() : new Date().toISOString(),
  };
}

export async function initDatabase(): Promise<{ mode: "mongodb" | "local" }> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.warn("[db] MONGODB_URI not set. Using persistent local disk store (.data/studymate-db.json).");
    ensureLocalStore();
    return { mode: "local" };
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 6000,
    });
    mongoConnected = true;
    console.log("[db] MongoDB connected successfully.");
    return { mode: "mongodb" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[db] MongoDB connection unavailable (${message}). Using persistent local disk store.`);
    mongoConnected = false;
    ensureLocalStore();
    return { mode: "local" };
  }
}

export function isMongoReady(): boolean {
  return mongoConnected && mongoose.connection.readyState === 1;
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const normalized = email.trim().toLowerCase();
  if (isMongoReady()) {
    const doc = await UserModel.findOne({ email: normalized }).lean<Record<string, unknown> | null>();
    if (!doc) return null;
    return {
      id: String(doc._id),
      name: String(doc.name),
      email: String(doc.email),
      passwordHash: String(doc.passwordHash),
      createdAt: doc.createdAt ? new Date(doc.createdAt as string).toISOString() : undefined,
    };
  }
  const store = ensureLocalStore();
  return store.users.find((u) => u.email.toLowerCase() === normalized) ?? null;
}

export async function findUserById(id: string): Promise<UserProfile | null> {
  if (isMongoReady()) {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await UserModel.findById(id).lean<Record<string, unknown> | null>();
    if (!doc) return null;
    return {
      id: String(doc._id),
      name: String(doc.name),
      email: String(doc.email),
      createdAt: doc.createdAt ? new Date(doc.createdAt as string).toISOString() : undefined,
    };
  }
  const store = ensureLocalStore();
  const user = store.users.find((u) => u.id === id);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<UserProfile> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedName = input.name.trim();

  if (isMongoReady()) {
    const created = await UserModel.create({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash: input.passwordHash,
    });
    return {
      id: String(created._id),
      name: created.name,
      email: created.email,
      createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  const store = ensureLocalStore();
  const newUser: StoredUser = {
    id: crypto.randomUUID(),
    name: trimmedName,
    email: normalizedEmail,
    passwordHash: input.passwordHash,
    createdAt: new Date().toISOString(),
  };
  store.users.push(newUser);
  writeLocalStore(store);
  return {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    createdAt: newUser.createdAt,
  };
}

export async function listMaterialsByUser(userId: string): Promise<StudyMaterial[]> {
  if (isMongoReady()) {
    if (!mongoose.isValidObjectId(userId)) return [];
    const docs = await StudyMaterialModel.find({ userId })
      .sort({ updatedAt: -1 })
      .lean<Array<Record<string, unknown>>>();
    return docs.map(mapMongoMaterial);
  }

  const store = ensureLocalStore();
  return store.materials
    .filter((m) => m.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function upsertStudyMaterial(input: {
  id?: string;
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
  flashcards?: Flashcard[];
  lastQuizScore?: number | null;
  lastQuizTotal?: number | null;
}): Promise<StudyMaterial> {
  if (isMongoReady()) {
    if (input.id && mongoose.isValidObjectId(input.id)) {
      const updated = await StudyMaterialModel.findOneAndUpdate(
        { _id: input.id, userId: input.userId },
        {
          videoId: input.videoId,
          videoTitle: input.videoTitle,
          channelTitle: input.channelTitle,
          thumbnailUrl: input.thumbnailUrl,
          transcript: input.transcript,
          noteStyle: input.noteStyle,
          notes: input.notes,
          notesMarkdown: input.notesMarkdown,
          quiz: input.quiz,
          ...(Array.isArray(input.flashcards) ? { flashcards: input.flashcards } : {}),
          ...(input.lastQuizScore !== undefined ? { lastQuizScore: input.lastQuizScore } : {}),
          ...(input.lastQuizTotal !== undefined ? { lastQuizTotal: input.lastQuizTotal } : {}),
        },
        { new: true }
      ).lean<Record<string, unknown> | null>();

      if (updated) {
        return mapMongoMaterial(updated);
      }
    }

    const existingByVideo = await StudyMaterialModel.findOne({
      userId: input.userId,
      videoId: input.videoId,
    }).lean<Record<string, unknown> | null>();

    if (existingByVideo) {
      const updated = await StudyMaterialModel.findByIdAndUpdate(
        existingByVideo._id,
        {
          videoTitle: input.videoTitle,
          channelTitle: input.channelTitle,
          thumbnailUrl: input.thumbnailUrl,
          transcript: input.transcript,
          noteStyle: input.noteStyle,
          notes: input.notes,
          notesMarkdown: input.notesMarkdown,
          quiz: input.quiz,
          ...(Array.isArray(input.flashcards) ? { flashcards: input.flashcards } : {}),
          ...(input.lastQuizScore !== undefined ? { lastQuizScore: input.lastQuizScore } : {}),
          ...(input.lastQuizTotal !== undefined ? { lastQuizTotal: input.lastQuizTotal } : {}),
        },
        { new: true }
      ).lean<Record<string, unknown>>();
      return mapMongoMaterial(updated!);
    }

    const created = await StudyMaterialModel.create({
      userId: input.userId,
      videoId: input.videoId,
      videoTitle: input.videoTitle,
      channelTitle: input.channelTitle,
      thumbnailUrl: input.thumbnailUrl,
      transcript: input.transcript,
      noteStyle: input.noteStyle,
      notes: input.notes,
      notesMarkdown: input.notesMarkdown,
      quiz: input.quiz,
      flashcards: Array.isArray(input.flashcards) ? input.flashcards : [],
      lastQuizScore: input.lastQuizScore ?? null,
      lastQuizTotal: input.lastQuizTotal ?? null,
    });
    return mapMongoMaterial(created.toObject() as Record<string, unknown>);
  }

  const store = ensureLocalStore();
  const now = new Date().toISOString();
  const idx = store.materials.findIndex(
    (m) =>
      m.userId === input.userId &&
      ((input.id && m.id === input.id) || m.videoId === input.videoId)
  );

  if (idx >= 0) {
    const prev = store.materials[idx];
    const updated: StudyMaterial = {
      ...prev,
      videoId: input.videoId,
      videoTitle: input.videoTitle,
      channelTitle: input.channelTitle,
      thumbnailUrl: input.thumbnailUrl,
      transcript: input.transcript,
      noteStyle: input.noteStyle,
      notes: input.notes,
      notesMarkdown: input.notesMarkdown,
      quiz: input.quiz,
      flashcards: Array.isArray(input.flashcards) ? input.flashcards : prev.flashcards ?? [],
      lastQuizScore: input.lastQuizScore !== undefined ? input.lastQuizScore : prev.lastQuizScore,
      lastQuizTotal: input.lastQuizTotal !== undefined ? input.lastQuizTotal : prev.lastQuizTotal,
      updatedAt: now,
    };
    store.materials[idx] = updated;
    writeLocalStore(store);
    return updated;
  }

  const created: StudyMaterial = {
    id: crypto.randomUUID(),
    userId: input.userId,
    videoId: input.videoId,
    videoTitle: input.videoTitle,
    channelTitle: input.channelTitle,
    thumbnailUrl: input.thumbnailUrl,
    transcript: input.transcript,
    noteStyle: input.noteStyle,
    notes: input.notes,
    notesMarkdown: input.notesMarkdown,
    quiz: input.quiz,
    flashcards: Array.isArray(input.flashcards) ? input.flashcards : [],
    lastQuizScore: input.lastQuizScore ?? null,
    lastQuizTotal: input.lastQuizTotal ?? null,
    createdAt: now,
    updatedAt: now,
  };
  store.materials.push(created);
  writeLocalStore(store);
  return created;
}

export async function updateMaterialScore(
  id: string,
  userId: string,
  score: number,
  total: number
): Promise<StudyMaterial | null> {
  if (isMongoReady()) {
    if (!mongoose.isValidObjectId(id)) return null;
    const updated = await StudyMaterialModel.findOneAndUpdate(
      { _id: id, userId },
      { lastQuizScore: score, lastQuizTotal: total },
      { new: true }
    ).lean<Record<string, unknown> | null>();
    return updated ? mapMongoMaterial(updated) : null;
  }

  const store = ensureLocalStore();
  const idx = store.materials.findIndex((m) => m.id === id && m.userId === userId);
  if (idx < 0) return null;
  store.materials[idx] = {
    ...store.materials[idx],
    lastQuizScore: score,
    lastQuizTotal: total,
    updatedAt: new Date().toISOString(),
  };
  writeLocalStore(store);
  return store.materials[idx];
}

export async function deleteMaterial(id: string, userId: string): Promise<boolean> {
  if (isMongoReady()) {
    if (!mongoose.isValidObjectId(id)) return false;
    const deleted = await StudyMaterialModel.findOneAndDelete({ _id: id, userId });
    return Boolean(deleted);
  }

  const store = ensureLocalStore();
  const before = store.materials.length;
  store.materials = store.materials.filter((m) => !(m.id === id && m.userId === userId));
  if (store.materials.length === before) return false;
  writeLocalStore(store);
  return true;
}
