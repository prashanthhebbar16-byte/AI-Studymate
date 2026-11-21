import "dotenv/config";
import path from "node:path";
import MongoStore from "connect-mongo";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import session from "express-session";
import { getSessionSecret } from "./server/auth.ts";
import { initDatabase, isMongoReady } from "./server/db.ts";
import authRoutes from "./server/routes/auth.ts";
import studyRoutes from "./server/routes/study.ts";
import videoRoutes from "./server/routes/videos.ts";

async function startServer(): Promise<void> {
  const dbStatus = await initDatabase();

  const app = express();
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));

  const isProd = process.env.NODE_ENV === "production";
  const sessionConfig: session.SessionOptions = {
    name: "studymate.sid",
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  };

  if (dbStatus.mode === "mongodb" && process.env.MONGODB_URI) {
    try {
      sessionConfig.store = MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
      });
    } catch (err) {
      console.warn(
        "[session] MongoStore unavailable, falling back to memory session store:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  app.use(session(sessionConfig));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      success: true,
      storage: isMongoReady() ? "mongodb" : "local",
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/videos", videoRoutes);
  app.use("/api/study", studyRoutes);

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[server error]", err);
    res.status(500).json({ error: "Unexpected server error." });
  });

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`AI StudyMate running on http://localhost:${port} (${dbStatus.mode})`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start AI StudyMate server:", err);
  process.exit(1);
});
