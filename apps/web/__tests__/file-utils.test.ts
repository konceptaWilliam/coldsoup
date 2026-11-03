import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFile, uploadSizeError } from "../lib/file-utils.ts";

const MB = 1024 * 1024;
// validateFile/uploadSizeError only read name, type and size.
const fake = (name: string, type: string, size: number) => ({ name, type, size }) as File;

test("validateFile: 300 MB video is accepted before compression", () => {
  assert.equal(validateFile(fake("clip.mov", "video/quicktime", 300 * MB)), null);
});

test("validateFile: 600 MB video is rejected at the 500 MB input limit", () => {
  const err = validateFile(fake("clip.mov", "video/quicktime", 600 * MB));
  assert.ok(err);
  assert.match(err.reason, /500 MB/);
});

test("validateFile: 300 MB audio is accepted before compression", () => {
  assert.equal(validateFile(fake("mix.wav", "audio/wav", 300 * MB)), null);
});

test("validateFile: 30 MB PDF is rejected at 25 MB", () => {
  const err = validateFile(fake("doc.pdf", "application/pdf", 30 * MB));
  assert.ok(err);
  assert.match(err.reason, /25 MB/);
});

test("uploadSizeError: video within 25 MB is fine", () => {
  assert.equal(uploadSizeError(fake("clip.mp4", "video/mp4", 24 * MB)), null);
});

test("uploadSizeError: video over 25 MB after compression is reported", () => {
  const msg = uploadSizeError(fake("clip.mp4", "video/mp4", 26 * MB));
  assert.ok(msg);
  assert.match(msg, /clip\.mp4/);
  assert.match(msg, /25 MB/);
});

test("uploadSizeError: audio over 25 MB after compression is reported", () => {
  assert.ok(uploadSizeError(fake("mix.m4a", "audio/mp4", 26 * MB)));
});
