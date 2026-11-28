"use strict";

// ==========================================
// 🧩 リモや共有コア（接続側・共有側・テスト共通）
// ==========================================
// 接続プロトコルの定数・メッセージ生成と検証・座標変換など、
// DOM に依存しない純粋なロジックをここに集約する。
// ブラウザでは window.RimoyaCore、Node では module.exports として使う。

(function (global) {

// 🌐 ICE サーバー設定（STUN / TURN）
const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
  ]
};

// 🔌 入力エージェントの WebSocket アドレス（共有側 PC の中だけ）
const HELPER_URL = "ws://127.0.0.1:39011";

// 🏷️ 共有コードから作る Peer ID の接頭辞
const PEER_ID_PREFIX = "rimoya-";

// 🔐 パスコードの試行上限（共有側がこの回数で接続を切る）
const MAX_AUTH_ATTEMPTS = 3;

// 🖱️ マウス移動の送信間隔（ms）。これより短い間隔では送らない
const MOVE_THROTTLE_MS = 40;

// 🎡 ホイールの行単位（deltaMode=1）をピクセルへ換算する倍率
const WHEEL_LINE_PX = 33;

// 🎲 暗号学的に安全な乱数で n 桁の数字列を作る
// fill はテスト用の差し替え口（省略時は crypto.getRandomValues）
function randomDigits(n, fill) {
  const get = fill || ((arr) => crypto.getRandomValues(arr));
  const arr = new Uint32Array(n);
  get(arr);
  let s = "";
  for (let i = 0; i < n; i++) s += String(arr[i] % 10);
  return s;
}

// 🔢 共有コード／パスコードの形式（6桁の数字）を確認する
function isSixDigitCode(value) {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

// 🏷️ 共有コードから Peer ID を作る
function peerIdForCode(code) {
  return PEER_ID_PREFIX + code;
}

// ------------------------------------------
// 📨 データチャネルのメッセージ
// ------------------------------------------
// 接続側 → 共有側: { type: "auth", pass } / { type: "input", ev }
// 共有側 → 接続側: { type: "auth-result", ok } /
//                  { type: "helper", connected } / { type: "bye" }

function makeAuthMessage(pass) {
  return { type: "auth", pass: pass };
}

function makeAuthResultMessage(ok) {
  return { type: "auth-result", ok: !!ok };
}

function makeHelperMessage(connected) {
  return { type: "helper", connected: !!connected };
}

function makeByeMessage() {
  return { type: "bye" };
}

function makeInputMessage(ev) {
  return { type: "input", ev: ev };
}

// 📥 受信メッセージを検証して正規化する（不正な形は null）
function parseDataMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  switch (msg.type) {
    case "auth":
      return typeof msg.pass === "string" ? { type: "auth", pass: msg.pass } : null;
    case "auth-result":
      return { type: "auth-result", ok: !!msg.ok };
    case "helper":
      return { type: "helper", connected: !!msg.connected };
    case "bye":
      return { type: "bye" };
    case "input":
      return isInputEvent(msg.ev) ? { type: "input", ev: msg.ev } : null;
    default:
      return null;
  }
}

// ------------------------------------------
// 🖱️ 入力イベント（共有側 → エージェントへ JSON で中継される形）
// ------------------------------------------
// { kind: "move", x, y }                        正規化座標 0..1
// { kind: "button", action, button }            action: down/up、button: 0=左 1=中 2=右
// { kind: "wheel", deltaY }                     ピクセル換算済みの縦スクロール量
// { kind: "key", action, code }                 KeyboardEvent.code
// { kind: "text", text }                        直接入力するテキスト
// { kind: "ping" }                              疎通確認用

const INPUT_KINDS = ["move", "button", "wheel", "key", "text", "ping"];

function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// 📥 入力イベントの形を検証する（エージェント側の受付条件と揃える）
function isInputEvent(ev) {
  if (!ev || typeof ev !== "object") return false;
  switch (ev.kind) {
    case "ping":
      return true;
    case "move":
      return isNumber(ev.x) && isNumber(ev.y);
    case "button":
      return (ev.action === "down" || ev.action === "up") &&
        Number.isInteger(ev.button) && ev.button >= 0 && ev.button <= 2;
    case "wheel":
      return isNumber(ev.deltaY);
    case "key":
      return (ev.action === "down" || ev.action === "up") &&
        typeof ev.code === "string" && ev.code.length > 0;
    case "text":
      return typeof ev.text === "string";
    default:
      return false;
  }
}

// ------------------------------------------
// 📐 座標変換
// ------------------------------------------
// 📐 0..1 の範囲に収める
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// 📐 映像の表示領域（レターボックス込み）を求める
// wrap の大きさと映像本来の大きさから、実際に映像が描かれる矩形を返す。
// left/top は wrap の左上を原点としたオフセット。
function computeContentRect(wrapWidth, wrapHeight, videoWidth, videoHeight) {
  const vw = videoWidth || wrapWidth;
  const vh = videoHeight || wrapHeight;
  const scale = Math.min(wrapWidth / vw, wrapHeight / vh);
  const w = vw * scale;
  const h = vh * scale;
  return {
    left: (wrapWidth - w) / 2,
    top: (wrapHeight - h) / 2,
    width: w,
    height: h
  };
}

// 📍 ポインター位置を正規化座標（0..1）に変換する
// rect はページ座標系での映像表示領域（left/top/width/height）
function normalizePoint(clientX, clientY, rect) {
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height)
  };
}

// 🎡 WheelEvent の deltaY をピクセル単位に換算する（行単位は1行＝33px）
function wheelDeltaPx(deltaY, deltaMode) {
  return deltaMode === 1 ? deltaY * WHEEL_LINE_PX : deltaY;
}

// 🖱️ マウス移動を送ってよいか（間引き判定）
function shouldSendMove(now, lastSentAt) {
  return now - lastSentAt >= MOVE_THROTTLE_MS;
}

const api = {
  ICE_CONFIG,
  HELPER_URL,
  PEER_ID_PREFIX,
  MAX_AUTH_ATTEMPTS,
  MOVE_THROTTLE_MS,
  WHEEL_LINE_PX,
  INPUT_KINDS,
  randomDigits,
  isSixDigitCode,
  peerIdForCode,
  makeAuthMessage,
  makeAuthResultMessage,
  makeHelperMessage,
  makeByeMessage,
  makeInputMessage,
  parseDataMessage,
  isInputEvent,
  clamp01,
  computeContentRect,
  normalizePoint,
  wheelDeltaPx,
  shouldSendMove
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
} else {
  global.RimoyaCore = api;
}

})(typeof window !== "undefined" ? window : globalThis);
