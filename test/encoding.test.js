import test from "node:test";
import assert from "node:assert/strict";
import { decodeResponseText } from "../src/worker.js";

test("decodeResponseText honors a declared legacy charset", () => {
  const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
  assert.equal(decodeResponseText(bytes, "text/html; charset=windows-1252"), "café");
});

test("decodeResponseText reads the charset from an HTML meta tag", () => {
  const prefix = new TextEncoder().encode('<meta charset="windows-1252">caf');
  const bytes = new Uint8Array([...prefix, 0xe9]);
  assert.equal(decodeResponseText(bytes, "text/html"), '<meta charset="windows-1252">café');
});

test("decodeResponseText honors UTF-16 byte-order marks", () => {
  const bytes = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);
  assert.equal(decodeResponseText(bytes, "text/html; charset=utf-8"), "Hi");
});

test("decodeResponseText defaults non-HTML content to UTF-8", () => {
  const bytes = new TextEncoder().encode("Alasis — 2048");
  assert.equal(decodeResponseText(bytes, "text/javascript"), "Alasis — 2048");
});
