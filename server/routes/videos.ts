import express from "express";
import type { Request, Response } from "express";
import { YoutubeTranscript } from "youtube-transcript";
import type { TranscriptSegment, YouTubeVideo } from "../../src/types.ts";

const router = express.Router();

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return YOUTUBE_ID_REGEX.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const vParam = parsed.searchParams.get("v");
      if (vParam && YOUTUBE_ID_REGEX.test(vParam)) return vParam;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (
        parts.length >= 2 &&
        (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live")
      ) {
        return YOUTUBE_ID_REGEX.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function formatIsoDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

function formatViewCount(raw?: string): string {
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K views`;
  return `${n} views`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveVideoById(videoId: string): Promise<YouTubeVideo | null> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (apiKey) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,contentDetails,statistics");
      url.searchParams.set("id", videoId);
      url.searchParams.set("key", apiKey);

      const resp = await fetch(url.toString());
      if (resp.ok) {
        const data = (await resp.json()) as {
          items?: Array<{
            id: string;
            snippet: {
              title: string;
              channelTitle: string;
              description: string;
              publishedAt: string;
              thumbnails?: { high?: { url: string }; medium?: { url: string } };
            };
            contentDetails?: { duration?: string };
            statistics?: { viewCount?: string };
          }>;
        };
        const item = data.items?.[0];
        if (item) {
          return {
            videoId: item.id,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            description: item.snippet.description,
            thumbnailUrl:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.medium?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            publishedAt: item.snippet.publishedAt,
            duration: item.contentDetails?.duration
              ? formatIsoDuration(item.contentDetails.duration)
              : undefined,
            viewCount: formatViewCount(item.statistics?.viewCount),
          };
        }
      }
    } catch {
      // Fall through to oEmbed
    }
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const resp = await fetch(oembedUrl);
    if (resp.ok) {
      const data = (await resp.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      return {
        videoId,
        title: data.title || `YouTube Video (${videoId})`,
        channelTitle: data.author_name || "YouTube Creator",
        description: "Loaded directly from YouTube video link.",
        thumbnailUrl:
          data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        publishedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Ignore
  }
  return null;
}

async function searchWithYouTubeDataApi(
  query: string,
  apiKey: string
): Promise<YouTubeVideo[]> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoEmbeddable", "true");
  searchUrl.searchParams.set("maxResults", "12");
  searchUrl.searchParams.set("relevanceLanguage", "en");
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`YouTube Data API error (${searchRes.status}): ${errText}`);
  }

  const searchData = (await searchRes.json()) as {
    items?: Array<{
      id: { videoId?: string };
      snippet: {
        title: string;
        channelTitle: string;
        description: string;
        publishedAt: string;
        thumbnails?: { high?: { url: string }; medium?: { url: string } };
      };
    }>;
  };

  const items = (searchData.items ?? []).filter((it) => Boolean(it.id?.videoId));
  if (items.length === 0) return [];

  const ids = items.map((it) => it.id.videoId!).join(",");
  const detailsMap = new Map<string, { duration?: string; viewCount?: string }>();

  try {
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "contentDetails,statistics");
    detailsUrl.searchParams.set("id", ids);
    detailsUrl.searchParams.set("key", apiKey);

    const detailsRes = await fetch(detailsUrl.toString());
    if (detailsRes.ok) {
      const detailsData = (await detailsRes.json()) as {
        items?: Array<{
          id: string;
          contentDetails?: { duration?: string };
          statistics?: { viewCount?: string };
        }>;
      };
      for (const detail of detailsData.items ?? []) {
        detailsMap.set(detail.id, {
          duration: detail.contentDetails?.duration
            ? formatIsoDuration(detail.contentDetails.duration)
            : undefined,
          viewCount: formatViewCount(detail.statistics?.viewCount),
        });
      }
    }
  } catch {
    // Details enrichment is optional
  }

  return items.map((item) => {
    const videoId = item.id.videoId!;
    const meta = detailsMap.get(videoId);
    return {
      videoId,
      title: decodeHtmlEntities(item.snippet.title),
      channelTitle: decodeHtmlEntities(item.snippet.channelTitle),
      description: decodeHtmlEntities(item.snippet.description),
      thumbnailUrl:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt: item.snippet.publishedAt,
      duration: meta?.duration,
      viewCount: meta?.viewCount,
    };
  });
}

async function searchYouTubePublicHtml(query: string): Promise<YouTubeVideo[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=US`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!resp.ok) {
    throw new Error(`YouTube search request failed (${resp.status}).`);
  }

  const html = await resp.text();
  const marker = "var ytInitialData = ";
  const start = html.indexOf(marker);
  if (start === -1) return [];

  const jsonStart = start + marker.length;
  const end = html.indexOf(";</script>", jsonStart);
  if (end === -1) return [];

  const parsed = JSON.parse(html.slice(jsonStart, end)) as Record<string, unknown>;
  const results: YouTubeVideo[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object" || results.length >= 12) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (obj.videoRenderer && typeof obj.videoRenderer === "object") {
      const vr = obj.videoRenderer as Record<string, unknown>;
      const videoId = typeof vr.videoId === "string" ? vr.videoId : "";
      if (YOUTUBE_ID_REGEX.test(videoId)) {
        const titleRuns = (vr.title as { runs?: Array<{ text?: string }> })?.runs;
        const title = titleRuns?.map((r) => r.text ?? "").join("") ?? "";
        const ownerRuns = (vr.ownerText as { runs?: Array<{ text?: string }> })?.runs;
        const channelTitle = ownerRuns?.[0]?.text ?? "YouTube";
        const lengthText = (vr.lengthText as { simpleText?: string })?.simpleText;
        const viewText = (vr.shortViewCountText as { simpleText?: string })?.simpleText;
        const publishedText = (vr.publishedTimeText as { simpleText?: string })?.simpleText ?? "";
        const snippetRuns = (vr.detailedMetadataSnippets as Array<{
          snippetText?: { runs?: Array<{ text?: string }> };
        }>)?.[0]?.snippetText?.runs;
        const description = snippetRuns?.map((r) => r.text ?? "").join("") ?? "";

        if (title) {
          results.push({
            videoId,
            title: decodeHtmlEntities(title),
            channelTitle: decodeHtmlEntities(channelTitle),
            description: decodeHtmlEntities(description),
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            publishedAt: publishedText,
            duration: lengthText,
            viewCount: viewText,
          });
        }
      }
      return;
    }
    for (const val of Object.values(obj)) {
      walk(val);
    }
  }

  walk(parsed);
  return results;
}

async function fetchTranscriptFromWatchPage(videoId: string): Promise<TranscriptSegment[]> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const resp = await fetch(watchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!resp.ok) return [];
  const html = await resp.text();

  const match = html.match(/"captionTracks":(\[.*?\])(?:,"audioTracks"|,"translationLanguages"|\})/);
  if (!match?.[1]) return [];

  let tracks: Array<{ baseUrl?: string; languageCode?: string; kind?: string }> = [];
  try {
    tracks = JSON.parse(match[1]) as Array<{
      baseUrl?: string;
      languageCode?: string;
      kind?: string;
    }>;
  } catch {
    return [];
  }

  if (!Array.isArray(tracks) || tracks.length === 0) return [];

  const chosen =
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ||
    tracks.find((t) => t.languageCode?.startsWith("en")) ||
    tracks[0];

  if (!chosen?.baseUrl) return [];

  const captionUrl = chosen.baseUrl.replace(/\\u0026/g, "&");
  const capRes = await fetch(captionUrl);
  if (!capRes.ok) return [];
  const xml = await capRes.text();

  const segments: TranscriptSegment[] = [];
  const lineRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(xml)) !== null) {
    const startSec = Number(m[1]);
    const durSec = Number(m[2]);
    const text = decodeHtmlEntities(m[3].replace(/<[^>]+>/g, " "));
    if (text) {
      segments.push({
        text,
        offset: Number.isFinite(startSec) ? Math.round(startSec * 1000) : 0,
        duration: Number.isFinite(durSec) ? Math.round(durSec * 1000) : 0,
      });
    }
  }
  return segments;
}

router.get("/search", async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q ?? "").trim();
    if (!query) {
      res.status(400).json({ error: "Please enter a study topic or YouTube URL." });
      return;
    }

    const directId = extractVideoId(query);
    if (directId) {
      const video = await resolveVideoById(directId);
      if (video) {
        res.json({ videos: [video], source: "direct" });
        return;
      }
    }

    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (apiKey) {
      try {
        const videos = await searchWithYouTubeDataApi(query, apiKey);
        if (videos.length > 0) {
          res.json({ videos, source: "youtube_api" });
          return;
        }
      } catch (apiErr) {
        console.warn(
          "[videos/search] YouTube Data API fallback triggered:",
          apiErr instanceof Error ? apiErr.message : String(apiErr)
        );
      }
    }

    const fallbackVideos = await searchYouTubePublicHtml(query);
    res.json({ videos: fallbackVideos, source: "youtube_web" });
  } catch (err) {
    console.error("[videos/search]", err);
    res.status(502).json({
      error: "Unable to search YouTube right now. You can also paste any YouTube video URL directly.",
    });
  }
});

router.get("/:videoId/transcript", async (req: Request, res: Response) => {
  const rawId = String(req.params.videoId ?? "");
  const videoId = extractVideoId(rawId);

  if (!videoId) {
    res.status(400).json({ error: "Invalid YouTube video ID." });
    return;
  }

  let segments: TranscriptSegment[] = [];

  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    if (Array.isArray(items) && items.length > 0) {
      segments = items.map((item) => ({
        text: decodeHtmlEntities(item.text),
        offset: Math.round(item.offset),
        duration: Math.round(item.duration),
      }));
    }
  } catch {
    // Fallback to watch page caption track extraction
  }

  if (segments.length === 0) {
    try {
      segments = await fetchTranscriptFromWatchPage(videoId);
    } catch {
      segments = [];
    }
  }

  if (segments.length === 0) {
    res.json({
      transcriptAvailable: false,
      segments: [],
      transcriptText: "",
      message:
        "Automatic captions are unavailable for this video. Paste the video transcript or lecture text below to generate AI notes and quizzes.",
    });
    return;
  }

  const transcriptText = segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  res.json({
    transcriptAvailable: true,
    segments,
    transcriptText,
  });
});

export default router;
