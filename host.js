"use strict";

// ==========================================
// 🖥️ 共有側（ホスト）
// ==========================================
// この PC の画面を getDisplayMedia で取得して WebRTC で送り、
// 接続側からの入力を入力エージェント（ws://127.0.0.1:39011）へ中継する。
// パスコードが一致した相手にだけ映像を送り、入力を受け付ける。
// プロトコルの定数と検証は js/rimoya-core.js（RimoyaCore）に集約している。

const Core = window.RimoyaCore;

const $ = (id) => document.getElementById(id);
const helperStatus = $("helperStatus");
const hostStatus = $("hostStatus");
const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
const codeBox = $("codeBox");
const shareCodeEl = $("shareCode");
const sharePassEl = $("sharePass");
const previewCard = $("previewCard");
const localVideo = $("localVideo");
const peerInfo = $("peerInfo");

// 🔌 共有状態
let helperWs = null;
let helperConnected = false;
let stream = null;
let peer = null;
let shareCode = "";
let sharePass = "";
let mediaCall = null;
let dataConn = null;

// ------------------------------------------
// 🔌 入力エージェント接続
// ------------------------------------------
// 🔌 入力エージェントへ接続する
function connectHelper() {
  try { if (helperWs) helperWs.close(); } catch (e) {}
  let ws;
  try {
    ws = new WebSocket(Core.HELPER_URL);
  } catch (e) {
    helperStatus.textContent = "未接続（閲覧のみ）";
    return;
  }
  helperWs = ws;
  ws.onopen = () => {
    helperConnected = true;
    helperStatus.textContent = "接続済み（操作を受け付けます）";
    notifyHelperState();
  };
  ws.onclose = () => {
    if (helperWs === ws) {
      helperConnected = false;
      helperStatus.textContent = "未接続（閲覧のみ）";
      notifyHelperState();
    }
  };
  ws.onerror = () => {
    helperStatus.textContent = "未接続（閲覧のみ）";
    try { ws.close(); } catch (e) {}
  };
}
$("helperRetryBtn").addEventListener("click", connectHelper);
connectHelper();

// 📣 エージェントの接続状態を接続側へ知らせる
function notifyHelperState() {
  if (dataConn && dataConn.open) {
    try { dataConn.send(Core.makeHelperMessage(helperConnected)); } catch (e) {}
  }
}

// ------------------------------------------
// 🔗 共有
// ------------------------------------------
// 🛑 共有を止めて初期状態に戻す
function stopSharing(message, notifyPeer) {
  if (notifyPeer && dataConn && dataConn.open) {
    try { dataConn.send(Core.makeByeMessage()); } catch (e) {}
  }
  try { if (mediaCall) mediaCall.close(); } catch (e) {}
  try { if (dataConn) dataConn.close(); } catch (e) {}
  try { if (peer) peer.destroy(); } catch (e) {}
  if (stream) stream.getTracks().forEach((t) => t.stop());
  mediaCall = null; dataConn = null; peer = null; stream = null;
  localVideo.srcObject = null;
  previewCard.hidden = true;
  codeBox.hidden = true;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  if (message) hostStatus.textContent = message;
}

// 📡 共有コードで Peer を登録する
function registerPeer() {
  peer = new Peer(Core.peerIdForCode(shareCode), { config: Core.ICE_CONFIG });
  peer.on("open", () => {
    shareCodeEl.textContent = shareCode;
    sharePassEl.textContent = sharePass;
    codeBox.hidden = false;
    hostStatus.textContent = "共有中です。接続側で共有コードとパスコードを入力してもらってください。";
  });
  peer.on("error", (err) => {
    if (err && err.type === "unavailable-id") {
      // 🔁 コードが重なった場合は取り直して再登録する
      try { peer.destroy(); } catch (e) {}
      shareCode = Core.randomDigits(6);
      registerPeer();
    } else {
      hostStatus.textContent = "エラー: " + (err && err.type ? err.type : err);
    }
  });
  peer.on("connection", (conn) => {
    if (dataConn) { try { conn.close(); } catch (e) {} return; } // 同時に受け付けるのは1接続だけ
    dataConn = conn;
    let attempts = 0;
    let authedConn = false;
    conn.on("data", (raw) => {
      const msg = Core.parseDataMessage(raw);
      if (!msg) return;
      if (msg.type === "auth") {
        if (msg.pass === sharePass) {
          authedConn = true;
          conn.send(Core.makeAuthResultMessage(true));
          conn.send(Core.makeHelperMessage(helperConnected));
          peerInfo.textContent = "接続側が認証しました。映像を送信中です。";
          // 📹 映像はパスコード認証が通ってから初めて送る
          mediaCall = peer.call(conn.peer, stream);
          mediaCall.on("close", () => { peerInfo.textContent = "接続側が映像を閉じました。"; });
        } else {
          attempts++;
          conn.send(Core.makeAuthResultMessage(false));
          if (attempts >= Core.MAX_AUTH_ATTEMPTS) { try { conn.close(); } catch (e) {} } // パスコードの試行は3回まで
        }
        return;
      }
      // ⌨️ 入力は認証済みの接続からのものだけをエージェントへ中継する
      if (msg.type === "input" && authedConn) {
        if (helperWs && helperWs.readyState === WebSocket.OPEN) {
          try { helperWs.send(JSON.stringify(msg.ev)); } catch (e) {}
        }
      }
    });
    conn.on("close", () => {
      if (dataConn === conn) {
        dataConn = null;
        peerInfo.textContent = "接続待ちです。";
      }
    });
  });
}

// ▶️ 共有開始ボタン：画面を取得して共有を始める
startBtn.addEventListener("click", async () => {
  if (!window.Peer) { hostStatus.textContent = "通信ライブラリが読み込めませんでした。ページを再読み込みしてください。"; return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    hostStatus.textContent = "このブラウザは画面共有に対応していません。";
    return;
  }
  startBtn.disabled = true;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } }, // 目標フレームレート 30fps
      audio: false
    });
  } catch (e) {
    startBtn.disabled = false;
    hostStatus.textContent = "画面の選択がキャンセルされました。";
    return;
  }
  localVideo.srcObject = stream;
  previewCard.hidden = false;
  const track = stream.getVideoTracks()[0];
  if (track) track.onended = () => stopSharing("画面共有が終了しました（ブラウザの共有停止）。", true);
  shareCode = Core.randomDigits(6);
  sharePass = Core.randomDigits(6);
  stopBtn.disabled = false;
  registerPeer();
});

stopBtn.addEventListener("click", () => stopSharing("共有を停止しました。", true));
window.addEventListener("beforeunload", () => stopSharing("", true));
