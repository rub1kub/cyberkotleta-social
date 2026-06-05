import type { MediaAttachment, MediaKind } from "./types";

export async function createMediaAttachment(file: File, type: MediaKind): Promise<MediaAttachment> {
  const dataUrl = await readFileAsDataUrl(file);

  try {
    const response = await fetch("/api/media", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataUrl,
        name: file.name,
        size: file.size,
        type,
      }),
    });

    if (response.ok) {
      const payload = (await response.json()) as { attachment?: MediaAttachment };
      if (payload.attachment?.url) return payload.attachment;
    }
  } catch {
    // Local file preview still works when the media API is unavailable.
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type,
    url: dataUrl,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
