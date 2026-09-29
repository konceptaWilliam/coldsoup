// Session map: uploaded attachment URL -> local object URL. A just-sent image
// keeps rendering its local preview instead of flashing blank while the remote
// copy downloads.
const previews = new Map<string, string>();

export function registerLocalPreview(remoteUrl: string, objectUrl: string): void {
  previews.set(remoteUrl, objectUrl);
}

export function localPreview(url: string): string | undefined {
  return previews.get(url);
}

export function releaseLocalPreviews(objectUrls: string[]): void {
  if (objectUrls.length === 0) return;
  const set = new Set(objectUrls);
  for (const [remote, local] of previews) if (set.has(local)) previews.delete(remote);
  for (const url of objectUrls) URL.revokeObjectURL(url);
}
