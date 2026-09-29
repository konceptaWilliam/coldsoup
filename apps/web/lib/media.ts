// Layout box for media whose dimensions were recorded at upload, so rows don't
// change height when the image or video loads.
export function aspectStyle(att: { width?: number; height?: number }): { aspectRatio?: string } {
  const { width, height } = att;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return {};
  }
  return { aspectRatio: `${width} / ${height}` };
}
