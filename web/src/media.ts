/**
 * Chips media endpoint client — image host at chips.poyzo.ir.
 *
 * Uploads need the shared token. Resolution order: the user's own
 * "Media token" in Settings (localStorage `chips:media-token`) wins over
 * the build-time token injected by vite (`__CHIPS_UPLOAD_TOKEN__`, from
 * the CHIPS_UPLOAD_TOKEN GitHub secret). With no token, uploads are
 * disabled and every feature that needs them hides itself; viewing
 * images never needs a token (ids are unguessable capabilities).
 */

export const MEDIA_BASE = "https://chips.poyzo.ir";
const TOKEN_KEY = "chips:media-token";

/** Endpoint ids look like `9f2c41ab07e34d5f8a1c0e5b6d7a33f0.jpg`. */
const ID_RE = /^[0-9a-f]{32}\.(?:png|jpe?g|webp|gif)$/i;
const IMAGE_URL_RE = /^https:\/\/chips\.poyzo\.ir\/i\/([0-9a-f]{32}\.(?:png|jpe?g|webp|gif))$/i;

export function isMediaId(v: unknown): v is string {
  return typeof v === "string" && ID_RE.test(v);
}

/** Full view URL for a stored media id. */
export function mediaUrl(id: string): string {
  return `${MEDIA_BASE}/i/${id}`;
}

/**
 * If a chat message is exactly one Chips image URL (optionally wrapped in
 * TeamSpeak's [URL]…[/URL] BBCode), return its media id; otherwise null.
 * Only whole-message images render inline — a link inside a sentence
 * stays a link.
 */
export function chipsImageIdFromMessage(text: string): string | null {
  let t = text.trim();
  const bb = /^\[url(?:=[^\]]*)?\]([\s\S]*)\[\/url\]$/i.exec(t);
  if (bb) t = bb[1].trim();
  const m = IMAGE_URL_RE.exec(t);
  return m ? m[1].toLowerCase() : null;
}

export function loadMediaTokenOverride(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveMediaTokenOverride(token: string): void {
  try {
    if (token.trim()) localStorage.setItem(TOKEN_KEY, token.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — token simply won't persist */
  }
}

export function mediaToken(): string {
  const override = loadMediaTokenOverride();
  if (override) return override;
  try {
    return typeof __CHIPS_UPLOAD_TOKEN__ === "string" ? __CHIPS_UPLOAD_TOKEN__ : "";
  } catch {
    return "";
  }
}

export function mediaUploadEnabled(): boolean {
  return mediaToken().length > 0;
}

export type MediaUpload = { id: string; url: string; bytes: number };

/** Upload one image file; resolves with the stored id + full URL. */
export async function uploadMedia(file: Blob, filename = "image"): Promise<MediaUpload> {
  const token = mediaToken();
  if (!token) throw new Error("media-token-missing");
  const form = new FormData();
  form.append("file", file, filename);
  const res = await fetch(`${MEDIA_BASE}/upload`, {
    method: "POST",
    headers: { "X-Upload-Token": token },
    body: form,
  });
  if (!res.ok) {
    let code = `http-${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) code = body.error;
    } catch {
      /* keep the http code */
    }
    throw new Error(code);
  }
  const body = (await res.json()) as { id?: string; url?: string; bytes?: number };
  if (!body.id || !isMediaId(body.id)) throw new Error("bad-upload-response");
  return { id: body.id, url: mediaUrl(body.id), bytes: body.bytes ?? 0 };
}
