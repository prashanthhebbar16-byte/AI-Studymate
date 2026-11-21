import bcrypt from "bcryptjs";
import express from "express";
import type { Request, Response } from "express";
import {
  extractUserIdFromRequest,
  signAuthToken,
} from "../auth.ts";
import { createUser, findUserByEmail, findUserById } from "../db.ts";

const router = express.Router();

function setSessionUser(req: Request, userId: string): void {
  const sess = (req as Request & { session?: { userId?: string; save?: (cb: () => void) => void } }).session;
  if (sess) {
    sess.userId = userId;
  }
}

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };

    const trimmedName = (name ?? "").trim();
    const normalizedEmail = (email ?? "").trim().toLowerCase();
    const rawPassword = password ?? "";

    if (trimmedName.length < 2) {
      res.status(400).json({ error: "Please enter your full name (at least 2 characters)." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }
    if (rawPassword.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long." });
      return;
    }

    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists. Please sign in." });
      return;
    }

    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const user = await createUser({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
    });

    setSessionUser(req, user.id);
    const token = signAuthToken(user.id);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error("[auth/register]", err);
    res.status(500).json({ error: "Unable to create your account right now. Please try again." });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    const normalizedEmail = (email ?? "").trim().toLowerCase();
    const rawPassword = password ?? "";

    if (!normalizedEmail || !rawPassword) {
      res.status(400).json({ error: "Please enter both your email and password." });
      return;
    }

    const existing = await findUserByEmail(normalizedEmail);
    if (!existing) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const passwordMatches = await bcrypt.compare(rawPassword, existing.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    setSessionUser(req, existing.id);
    const token = signAuthToken(existing.id);

    res.json({
      user: {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        createdAt: existing.createdAt,
      },
      token,
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ error: "Unable to sign in right now. Please try again." });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  const sess = (req as Request & { session?: { destroy?: (cb: (err?: unknown) => void) => void } }).session;
  if (sess && typeof sess.destroy === "function") {
    sess.destroy(() => {
      res.clearCookie("studymate.sid");
      res.json({ success: true });
    });
  } else {
    res.clearCookie("studymate.sid");
    res.json({ success: true });
  }
});

router.get("/me", async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req);
    if (!userId) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }
    const user = await findUserById(userId);
    if (!user) {
      res.status(401).json({ error: "Session not found." });
      return;
    }
    res.json({ user });
  } catch (err) {
    console.error("[auth/me]", err);
    res.status(500).json({ error: "Failed to verify session." });
  }
});

export default router;
