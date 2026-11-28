"use strict";

// ==========================================
// 🧪 リモや共有コアの単体テスト（node --test）
// ==========================================

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../js/rimoya-core.js");

// ------------------------------------------
// 🎲 共有コード／パスコード生成
// ------------------------------------------
test("randomDigits: injected values map to digits via % 10", () => {
  const fill = (arr) => { arr.set([0, 15, 4294967295, 7, 100, 999999999]); };
  assert.equal(Core.randomDigits(6, fill), "055709");
});

test("randomDigits: respects the requested length", () => {
  const fill = (arr) => arr.fill(3);
  assert.equal(Core.randomDigits(1, fill), "3");
  assert.equal(Core.randomDigits(12, fill), "333333333333");
});

test("randomDigits: real crypto source always yields 6 numeric digits", () => {
  for (let i = 0; i < 200; i++) {
    assert.match(Core.randomDigits(6), /^\d{6}$/);
  }
});

test("isSixDigitCode: accepts exactly 6 ASCII digits", () => {
  assert.equal(Core.isSixDigitCode("012345"), true);
  assert.equal(Core.isSixDigitCode("123456"), true);
});

test("isSixDigitCode: rejects everything else", () => {
  for (const bad of ["", "12345", "1234567", "12a456", " 123456", "123456 ", "１２３４５６", 123456, null, undefined]) {
    assert.equal(Core.isSixDigitCode(bad), false, JSON.stringify(bad));
  }
});

test("peerIdForCode: prefixes the share code", () => {
  assert.equal(Core.peerIdForCode("042069"), "rimoya-042069");
});

// ------------------------------------------
// 📨 データチャネルメッセージ
// ------------------------------------------
test("message makers produce the exact wire shapes", () => {
  assert.deepEqual(Core.makeAuthMessage("123456"), { type: "auth", pass: "123456" });
  assert.deepEqual(Core.makeAuthResultMessage(true), { type: "auth-result", ok: true });
  assert.deepEqual(Core.makeAuthResultMessage(0), { type: "auth-result", ok: false });
  assert.deepEqual(Core.makeHelperMessage(true), { type: "helper", connected: true });
  assert.deepEqual(Core.makeHelperMessage(undefined), { type: "helper", connected: false });
  assert.deepEqual(Core.makeByeMessage(), { type: "bye" });
  const ev = { kind: "move", x: 0.5, y: 0.25 };
  assert.deepEqual(Core.makeInputMessage(ev), { type: "input", ev });
});

test("parseDataMessage: round-trips every message type", () => {
  assert.deepEqual(Core.parseDataMessage(Core.makeAuthMessage("999999")), { type: "auth", pass: "999999" });
  assert.deepEqual(Core.parseDataMessage(Core.makeAuthResultMessage(true)), { type: "auth-result", ok: true });
  assert.deepEqual(Core.parseDataMessage(Core.makeHelperMessage(false)), { type: "helper", connected: false });
  assert.deepEqual(Core.parseDataMessage(Core.makeByeMessage()), { type: "bye" });
  const ev = { kind: "key", action: "down", code: "KeyA" };
  assert.deepEqual(Core.parseDataMessage(Core.makeInputMessage(ev)), { type: "input", ev });
});

test("parseDataMessage: rejects non-objects and unknown types", () => {
  for (const bad of [null, undefined, 42, "auth", [], {}, { type: "nope" }, { type: 7 }]) {
    assert.equal(Core.parseDataMessage(bad), null, JSON.stringify(bad));
  }
});

test("parseDataMessage: auth requires a string pass", () => {
  assert.equal(Core.parseDataMessage({ type: "auth" }), null);
  assert.equal(Core.parseDataMessage({ type: "auth", pass: 123456 }), null);
  assert.deepEqual(Core.parseDataMessage({ type: "auth", pass: "" }), { type: "auth", pass: "" });
});

test("parseDataMessage: input requires a well-formed event", () => {
  assert.equal(Core.parseDataMessage({ type: "input" }), null);
  assert.equal(Core.parseDataMessage({ type: "input", ev: { kind: "button", action: "down", button: 3 } }), null);
  assert.deepEqual(
    Core.parseDataMessage({ type: "input", ev: { kind: "text", text: "あ" } }),
    { type: "input", ev: { kind: "text", text: "あ" } });
});

// ------------------------------------------
// 🖱️ 入力イベント検証
// ------------------------------------------
test("isInputEvent: accepts every valid kind", () => {
  assert.equal(Core.isInputEvent({ kind: "ping" }), true);
  assert.equal(Core.isInputEvent({ kind: "move", x: 0, y: 1 }), true);
  assert.equal(Core.isInputEvent({ kind: "button", action: "down", button: 0 }), true);
  assert.equal(Core.isInputEvent({ kind: "button", action: "up", button: 2 }), true);
  assert.equal(Core.isInputEvent({ kind: "wheel", deltaY: -120 }), true);
  assert.equal(Core.isInputEvent({ kind: "key", action: "down", code: "Enter" }), true);
  assert.equal(Core.isInputEvent({ kind: "text", text: "" }), true);
});

test("isInputEvent: rejects malformed events", () => {
  const bad = [
    null, undefined, "move", {},
    { kind: "scroll" },
    { kind: "move", x: 0.5 },
    { kind: "move", x: NaN, y: 0 },
    { kind: "move", x: Infinity, y: 0 },
    { kind: "move", x: "0.5", y: 0 },
    { kind: "button", action: "press", button: 0 },
    { kind: "button", action: "down", button: -1 },
    { kind: "button", action: "down", button: 3 },
    { kind: "button", action: "down", button: 0.5 },
    { kind: "wheel" },
    { kind: "wheel", deltaY: "100" },
    { kind: "key", action: "down", code: "" },
    { kind: "key", action: "down" },
    { kind: "text", text: 42 }
  ];
  for (const ev of bad) {
    assert.equal(Core.isInputEvent(ev), false, JSON.stringify(ev));
  }
});

// ------------------------------------------
// 📐 座標変換
// ------------------------------------------
test("computeContentRect: exact fit has no letterbox", () => {
  assert.deepEqual(Core.computeContentRect(1600, 900, 1600, 900),
    { left: 0, top: 0, width: 1600, height: 900 });
});

test("computeContentRect: wide video in a square wrap is letterboxed vertically", () => {
  assert.deepEqual(Core.computeContentRect(1000, 1000, 1600, 900),
    { left: 0, top: 218.75, width: 1000, height: 562.5 });
});

test("computeContentRect: tall video in a wide wrap is pillarboxed", () => {
  assert.deepEqual(Core.computeContentRect(1600, 900, 900, 1600),
    { left: 546.875, top: 0, width: 506.25, height: 900 });
});

test("computeContentRect: missing video size falls back to the wrap size", () => {
  assert.deepEqual(Core.computeContentRect(800, 600, 0, 0),
    { left: 0, top: 0, width: 800, height: 600 });
});

test("normalizePoint: center and corners map to 0..1", () => {
  const rect = { left: 100, top: 50, width: 800, height: 450 };
  assert.deepEqual(Core.normalizePoint(500, 275, rect), { x: 0.5, y: 0.5 });
  assert.deepEqual(Core.normalizePoint(100, 50, rect), { x: 0, y: 0 });
  assert.deepEqual(Core.normalizePoint(900, 500, rect), { x: 1, y: 1 });
});

test("normalizePoint: positions outside the rect are clamped", () => {
  const rect = { left: 100, top: 50, width: 800, height: 450 };
  assert.deepEqual(Core.normalizePoint(-50, 9999, rect), { x: 0, y: 1 });
  assert.deepEqual(Core.normalizePoint(9999, -50, rect), { x: 1, y: 0 });
});

test("clamp01: bounds values to 0..1", () => {
  assert.equal(Core.clamp01(-0.2), 0);
  assert.equal(Core.clamp01(0.25), 0.25);
  assert.equal(Core.clamp01(1.7), 1);
});

// ------------------------------------------
// 🎡 ホイール・移動の間引き
// ------------------------------------------
test("wheelDeltaPx: pixel mode passes through, line mode multiplies by 33", () => {
  assert.equal(Core.wheelDeltaPx(120, 0), 120);
  assert.equal(Core.wheelDeltaPx(-53.5, 0), -53.5);
  assert.equal(Core.wheelDeltaPx(3, 1), 99);
  assert.equal(Core.wheelDeltaPx(-2, 1), -66);
  assert.equal(Core.wheelDeltaPx(5, 2), 5); // その他のモードはそのまま
});

test("shouldSendMove: enforces the 40ms throttle", () => {
  assert.equal(Core.shouldSendMove(1000, 0), true);
  assert.equal(Core.shouldSendMove(1039, 1000), false);
  assert.equal(Core.shouldSendMove(1040, 1000), true);
});

// ------------------------------------------
// 🔒 プロトコル定数（セキュリティモデルの固定）
// ------------------------------------------
test("protocol constants keep the security model intact", () => {
  assert.equal(Core.HELPER_URL, "ws://127.0.0.1:39011");
  assert.equal(Core.PEER_ID_PREFIX, "rimoya-");
  assert.equal(Core.MAX_AUTH_ATTEMPTS, 3);
  assert.equal(Core.MOVE_THROTTLE_MS, 40);
  assert.deepEqual(Core.INPUT_KINDS, ["move", "button", "wheel", "key", "text", "ping"]);
});

test("ICE_CONFIG: Google STUN and metered openrelay TURN are configured", () => {
  const urls = Core.ICE_CONFIG.iceServers.map((s) => s.urls);
  assert.ok(urls.includes("stun:stun.l.google.com:19302"));
  assert.ok(urls.includes("stun:stun1.l.google.com:19302"));
  assert.ok(urls.includes("turn:openrelay.metered.ca:80"));
  assert.ok(urls.includes("turn:openrelay.metered.ca:443"));
  for (const s of Core.ICE_CONFIG.iceServers) {
    if (s.urls.startsWith("turn:")) {
      assert.equal(s.username, "openrelayproject");
      assert.equal(s.credential, "openrelayproject");
    }
  }
});
