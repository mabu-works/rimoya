"use strict";

// ==========================================
// 🖥️ 接続側（閲覧・操作）
// ==========================================
// 映像は WebRTC（PeerJS）で受け取り、入力はデータチャネルで共有側へ送る。
// 共有側のホストページが入力エージェントへ中継し、PC 上で実行される。
// プロトコルの定数と純粋な計算は js/rimoya-core.js（RimoyaCore）に集約している。

const Core = window.RimoyaCore;

const $ = (id) => document.getElementById(id);
// 🧩 画面要素の取得
const codeInput = $("codeInput");
const passInput = $("passInput");
const connectBtn = $("connectBtn");
const disconnectBtn = $("disconnectBtn");
const statusMsg = $("statusMsg");
const screenCard = $("screenCard");
const videoWrap = $("videoWrap");
const remoteVideo = $("remoteVideo");
const videoHint = $("videoHint");
const keyboardToggle = $("keyboardToggle");
const textInput = $("textInput");

// 🔌 接続状態
let peer = null;
let conn = null;
let call = null;
let authed = false;
let lastMoveSent = 0;

// 💬 状態メッセージを表示する
function setStatus(text) { statusMsg.textContent = text; }

// 📤 入力イベントを共有側へ送る（認証済みのときだけ）
function sendInput(ev) {
  if (!conn || !authed || !conn.open) return;
  try { conn.send(Core.makeInputMessage(ev)); } catch (e) { /* 送信失敗は無視 */ }
}

// 🔌 接続を片付けて初期状態に戻す
function resetConnection(message) {
  authed = false;
  try { if (call) call.close(); } catch (e) {}
  try { if (conn) conn.close(); } catch (e) {}
  try { if (peer) peer.destroy(); } catch (e) {}
  call = null; conn = null; peer = null;
  remoteVideo.srcObject = null;
  screenCard.hidden = true;
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  if (message) setStatus(message);
}

// 🔗 接続ボタン：コードとパスコードを検証して共有へ接続する
connectBtn.addEventListener("click", () => {
  const code = codeInput.value.trim();
  const pass = passInput.value.trim();
  if (!Core.isSixDigitCode(code)) { setStatus("共有コードは6桁の数字で入力してください。"); return; }
  if (!Core.isSixDigitCode(pass)) { setStatus("パスコードは6桁の数字で入力してください。"); return; }
  if (!window.Peer) { setStatus("通信ライブラリが読み込めませんでした。ページを再読み込みしてください。"); return; }

  resetConnection();
  connectBtn.disabled = true;
  setStatus("接続しています…");

  peer = new Peer({ config: Core.ICE_CONFIG });
  peer.on("open", () => {
    conn = peer.connect(Core.peerIdForCode(code), { reliable: true });
    conn.on("open", () => {
      // 🔐 まずパスコード認証。映像も入力も認証が通るまで始まらない
      conn.send(Core.makeAuthMessage(pass));
      setStatus("パスコードを確認しています…");
    });
    conn.on("data", (raw) => {
      const msg = Core.parseDataMessage(raw);
      if (!msg) return;
      if (msg.type === "auth-result") {
        if (msg.ok) {
          authed = true;
          disconnectBtn.disabled = false;
          screenCard.hidden = false;
          setStatus("認証できました。映像の到着を待っています…");
        } else {
          resetConnection("パスコードが違います。共有側の表示を確認してください。");
        }
      } else if (msg.type === "helper") {
        if (!msg.connected) {
          setStatus("接続中（閲覧のみ）。共有側で入力エージェントが起動していないため、操作は送れません。");
        } else {
          setStatus("接続中。操作できます。");
        }
      } else if (msg.type === "bye") {
        resetConnection("共有側が共有を終了しました。");
      }
    });
    conn.on("close", () => { if (peer) resetConnection("共有側との接続が切れました。"); });
    conn.on("error", () => { setStatus("データ接続でエラーが発生しました。"); });
  });
  peer.on("call", (incoming) => {
    call = incoming;
    call.answer();
    call.on("stream", (stream) => {
      remoteVideo.srcObject = stream;
      videoHint.hidden = true;
      setStatus("接続中。画面を操作できます。");
      videoWrap.focus();
    });
    call.on("close", () => { resetConnection("映像が終了しました。"); });
  });
  peer.on("error", (err) => {
    if (err && err.type === "peer-unavailable") {
      resetConnection("その共有コードの共有が見つかりません。共有側で共有が始まっているか確認してください。");
    } else if (err && err.type === "network") {
      resetConnection("シグナリングサーバーへ接続できませんでした。通信環境を確認してください。");
    } else {
      setStatus("エラー: " + (err && err.type ? err.type : err));
      connectBtn.disabled = false;
    }
  });
  peer.on("disconnected", () => { if (peer) peer.reconnect(); });
});

// 🔌 切断ボタン：接続を切る
disconnectBtn.addEventListener("click", () => resetConnection("切断しました。"));

// ------------------------------------------
// 🖱️ 入力の送信
// ------------------------------------------
// 📐 映像の表示領域（レターボックス込み）をページ座標で求める
function contentRect() {
  const rect = videoWrap.getBoundingClientRect();
  const inner = Core.computeContentRect(
    rect.width, rect.height, remoteVideo.videoWidth, remoteVideo.videoHeight);
  return {
    left: rect.left + inner.left,
    top: rect.top + inner.top,
    width: inner.width,
    height: inner.height
  };
}

// 📍 ポインター位置を正規化座標（0..1）に変換する
function toNorm(e) {
  return Core.normalizePoint(e.clientX, e.clientY, contentRect());
}

// 🖱️ マウス移動・クリック・ホイールを送る
videoWrap.addEventListener("pointermove", (e) => {
  if (!authed) return;
  const now = Date.now();
  if (!Core.shouldSendMove(now, lastMoveSent)) return; // 送りすぎ防止（40ms間隔＝約25回/秒まで）
  lastMoveSent = now;
  const p = toNorm(e);
  sendInput({ kind: "move", x: p.x, y: p.y });
});

videoWrap.addEventListener("pointerdown", (e) => {
  if (!authed) return;
  e.preventDefault();
  videoWrap.focus();
  try { videoWrap.setPointerCapture(e.pointerId); } catch (err) {}
  const p = toNorm(e);
  sendInput({ kind: "move", x: p.x, y: p.y });
  sendInput({ kind: "button", action: "down", button: e.button });
});

videoWrap.addEventListener("pointerup", (e) => {
  if (!authed) return;
  sendInput({ kind: "button", action: "up", button: e.button });
});

videoWrap.addEventListener("pointercancel", (e) => {
  if (!authed) return;
  sendInput({ kind: "button", action: "up", button: e.button });
});

videoWrap.addEventListener("contextmenu", (e) => e.preventDefault());

videoWrap.addEventListener("wheel", (e) => {
  if (!authed) return;
  e.preventDefault();
  const dy = Core.wheelDeltaPx(e.deltaY, e.deltaMode); // 行単位の場合は1行＝33pxとして換算する
  sendInput({ kind: "wheel", deltaY: dy });
}, { passive: false });

// ⌨️ キー入力を送る（入力欄では通常の文字入力を優先する）
document.addEventListener("keydown", (e) => {
  if (!authed || !keyboardToggle.checked) return;
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return; // 入力欄では通常の文字入力を優先
  e.preventDefault();
  sendInput({ kind: "key", action: "down", code: e.code });
});

document.addEventListener("keyup", (e) => {
  if (!authed || !keyboardToggle.checked) return;
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  e.preventDefault();
  sendInput({ kind: "key", action: "up", code: e.code });
});

// 📝 テキスト入力を送る
$("textSendBtn").addEventListener("click", () => {
  const text = textInput.value;
  if (!text) return;
  sendInput({ kind: "text", text: text });
  textInput.value = "";
  textInput.focus();
});

textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("textSendBtn").click(); }
});

// 🖥️ 全画面表示に切り替える
$("fullscreenBtn").addEventListener("click", () => {
  if (videoWrap.requestFullscreen) videoWrap.requestFullscreen().catch(() => {});
});
