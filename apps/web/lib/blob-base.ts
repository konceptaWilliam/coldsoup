// The Lv1 silhouette a name hashes to. Shared by client and server; kept out of
// blob-evolution.ts so that module stays free of the blobatar import.
import { _layout } from "blobatar";
import { isShape, type Shape } from "@/lib/blob-evolution";

const cache = new Map<string, Shape>();

export function baseShapeOf(name: string): Shape {
  let s = cache.get(name);
  if (!s) {
    const shape = _layout(name).shape;
    s = isShape(shape) ? shape : "round";
    cache.set(name, s);
  }
  return s;
}
