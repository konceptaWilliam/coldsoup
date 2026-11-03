import { test } from "node:test";
import assert from "node:assert/strict";
import {
  needsCompression,
  targetVideoSize,
  compressedFileName,
} from "../lib/compression-policy.ts";

// Bytes for a given bitrate (bits/s) over a duration (s).
const bytesFor = (bps: number, sec: number) => (bps * sec) / 8;

test("needsCompression: audio at 128 kbps is skipped", () => {
  assert.equal(
    needsCompression({ kind: "audio", sizeBytes: bytesFor(128_000, 60), durationSec: 60 }),
    false,
  );
});

test("needsCompression: audio exactly at the 160 kbps skip limit is skipped", () => {
  assert.equal(
    needsCompression({ kind: "audio", sizeBytes: bytesFor(160_000, 60), durationSec: 60 }),
    false,
  );
});

test("needsCompression: WAV-size audio is compressed", () => {
  assert.equal(
    needsCompression({ kind: "audio", sizeBytes: 10 * 1024 * 1024, durationSec: 60 }),
    true,
  );
});

test("needsCompression: 1080p video is compressed", () => {
  assert.equal(
    needsCompression({
      kind: "video", sizeBytes: bytesFor(1_000_000, 60), durationSec: 60, width: 1920, height: 1080,
    }),
    true,
  );
});

test("needsCompression: small low-bitrate video is skipped", () => {
  assert.equal(
    needsCompression({
      kind: "video", sizeBytes: bytesFor(1_000_000, 60), durationSec: 60, width: 640, height: 360,
    }),
    false,
  );
});

test("needsCompression: small high-bitrate video is compressed", () => {
  assert.equal(
    needsCompression({
      kind: "video", sizeBytes: bytesFor(5_000_000, 60), durationSec: 60, width: 720, height: 480,
    }),
    true,
  );
});

test("needsCompression: unknown duration is compressed", () => {
  assert.equal(needsCompression({ kind: "audio", sizeBytes: 1000, durationSec: 0 }), true);
  assert.equal(needsCompression({ kind: "audio", sizeBytes: 1000, durationSec: NaN }), true);
});

test("targetVideoSize: landscape 1080p fits 720 on the long side, even dims", () => {
  assert.deepEqual(targetVideoSize(1920, 1080), { width: 720, height: 404 });
});

test("targetVideoSize: portrait 1080p fits 720 on the long side", () => {
  assert.deepEqual(targetVideoSize(1080, 1920), { width: 404, height: 720 });
});

test("targetVideoSize: small video is not upscaled", () => {
  assert.deepEqual(targetVideoSize(640, 360), { width: 640, height: 360 });
});

test("targetVideoSize: odd dims round down to even", () => {
  assert.deepEqual(targetVideoSize(641, 361), { width: 640, height: 360 });
});

test("compressedFileName: swaps the extension", () => {
  assert.equal(compressedFileName("clip.MOV", "video"), "clip.mp4");
  assert.equal(compressedFileName("mix.final.wav", "audio"), "mix.final.m4a");
});

test("compressedFileName: adds an extension when there is none", () => {
  assert.equal(compressedFileName("recording", "audio"), "recording.m4a");
});
