import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { findUserById } from "./db.ts";

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString("hex");

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() || EPHEMERAL_SECRET;
}

interface TokenPayload {
  uid: string;
  exp: number;
}

export function signAuthToken(userId: string): string {
  const payload: TokenPayload = {
    uid: userId,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expected = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
    if (!parsed.uid || typeof parsed.exp !== "number" || parsed.exp < Date.now()) {
      return null;
    }
    return parsed.uid;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function extractUserIdFromRequest(req: Request): string | null {
  const sess = (req as Request & { session?: { userId?: string } }).session;
  if (sess?.userId) {
    return sess.userId;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const uid = verifyAuthToken(token);
    if (uid) return uid;
  }

  return null;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = extractUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Please sign in to access your study materials." });
    return;
  }

  const user = await findUserById(userId);
  if (!user) {
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
    return;
  }

  req.userId = user.id;
  next();
}
