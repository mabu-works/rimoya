using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using RimoyaAgent;

// ==========================================
// 🤖 RimoyaAgent — 入力エージェント
// ==========================================
// 画面共有サイト「リモや」の入力エージェント。
//
// 操作される側の PC で動かし、ブラウザ（共有側ページ）から
// localhost WebSocket (ws://127.0.0.1:39011) で受け取った入力イベントを
// Windows の SendInput で実行する。
//
// 🔒 セキュリティ前提:
//   - バインドは 127.0.0.1 のみ。localhost 以外からは接続を受けない。
//   - 対応モニターはプライマリモニターのみ（座標はプライマリ画面に対する正規化座標）。
//   - 起動は利用者が PC の前で行う前提（無人常駐・自動起動はしない）。

const string Prefix = "http://127.0.0.1:39011/";

// 📝 ログを時刻付きで出力する
void Log(string message) =>
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {message}");

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true; // プロセスを即終了させず、後片付けしてから終わる
    cts.Cancel();
};

var listener = new HttpListener();
listener.Prefixes.Add(Prefix);

try
{
    listener.Start();
}
catch (HttpListenerException ex) when (ex.ErrorCode == 5) // Access is denied
{
    Log("エラー: ポートを開けませんでした（アクセス拒否）。");
    Log("管理者として実行するか、次のコマンドで URL 予約を追加してください:");
    Log("  netsh http add urlacl url=http://127.0.0.1:39011/ user=Everyone");
    return;
}
catch (Exception ex)
{
    Log($"エラー: サーバーを起動できませんでした: {ex.Message}");
    return;
}

Log("RimoyaAgent 起動中: ws://127.0.0.1:39011（終了は Ctrl+C）");
Log($"画面解像度: {NativeInput.ScreenWidth} x {NativeInput.ScreenHeight}（プライマリモニター）");

try
{
    while (!cts.Token.IsCancellationRequested)
    {
        HttpListenerContext context;
        try
        {
            context = await listener.GetContextAsync().WaitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            break;
        }

        if (!context.Request.IsWebSocketRequest)
        {
            context.Response.StatusCode = 400;
            context.Response.Close();
            Log($"WebSocket でないリクエストを拒否しました: {context.Request.HttpMethod} {context.Request.Url?.PathAndQuery}");
            continue;
        }

        // 👤 1クライアント前提：接続中はそのクライアントの処理が終わるまで次を受けない
        await HandleClientAsync(context);
    }
}
finally
{
    listener.Stop();
    listener.Close();
    Log("RimoyaAgent を終了しました。");
}

// 🔌 クライアント1件の受信ループを処理する
async Task HandleClientAsync(HttpListenerContext context)
{
    WebSocket? socket = null;
    string remote = context.Request.RemoteEndPoint?.ToString() ?? "unknown";
    try
    {
        var wsContext = await context.AcceptWebSocketAsync(subProtocol: null);
        socket = wsContext.WebSocket;
        Log($"接続しました: {remote}");

        var buffer = new byte[16 * 1024]; // 受信バッファ 16KB
        using var message = new MemoryStream();

        while (socket.State == WebSocketState.Open && !cts.Token.IsCancellationRequested)
        {
            message.SetLength(0);
            WebSocketReceiveResult result;
            do
            {
                result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
                    Log($"切断しました: {remote}");
                    return;
                }
                message.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);

            if (result.MessageType != WebSocketMessageType.Text) continue;

            string json = Encoding.UTF8.GetString(message.ToArray());
            Dispatch(json);
        }
    }
    catch (OperationCanceledException)
    {
        // 🛑 Ctrl+C による終了
    }
    catch (WebSocketException ex)
    {
        Log($"接続が異常終了しました ({remote}): {ex.Message}");
    }
    catch (Exception ex)
    {
        Log($"接続処理でエラーが発生しました ({remote}): {ex.Message}");
    }
    finally
    {
        socket?.Dispose();
    }
}

// 📨 1メッセージを1イベントとして振り分ける
// 不正な JSON や未知の kind は落とさずログに残す。
void Dispatch(string json)
{
    JsonDocument doc;
    try
    {
        doc = JsonDocument.Parse(json);
    }
    catch (JsonException)
    {
        Log($"不正な JSON を無視しました: {Truncate(json)}");
        return;
    }

    using (doc)
    {
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("kind", out var kindEl) ||
            kindEl.ValueKind != JsonValueKind.String)
        {
            Log($"kind のないメッセージを無視しました: {Truncate(json)}");
            return;
        }

        string kind = kindEl.GetString() ?? "";
        try
        {
            switch (kind)
            {
                case "ping":
                    break; // 何もしない（疎通確認用）

                case "move":
                    if (TryGetDouble(root, "x", out double x) && TryGetDouble(root, "y", out double y))
                        NativeInput.MoveMouse(x, y);
                    break;

                case "button":
                {
                    string action = GetString(root, "action");
                    int button = GetInt(root, "button", -1);
                    if ((action == "down" || action == "up") && button is >= 0 and <= 2) // ボタンは 0=左・1=中・2=右
                        NativeInput.MouseButton(button, action == "down");
                    else
                        Log($"不正な button イベントを無視しました: {Truncate(json)}");
                    break;
                }

                case "wheel":
                    if (TryGetDouble(root, "deltaY", out double deltaY))
                        NativeInput.Wheel(deltaY);
                    break;

                case "key":
                {
                    string action = GetString(root, "action");
                    string code = GetString(root, "code");
                    if ((action == "down" || action == "up") && code.Length > 0)
                    {
                        if (KeyMap.TryGet(code, out var info))
                            NativeInput.Key(info.Vk, action == "down", info.Extended);
                        else
                            Log($"未知のキーコードを無視しました: {code}");
                    }
                    break;
                }

                case "text":
                {
                    string text = GetString(root, "text");
                    if (text.Length > 0) NativeInput.Text(text);
                    break;
                }

                default:
                    Log($"未知の kind を無視しました: {kind}");
                    break;
            }
        }
        catch (Exception ex)
        {
            Log($"イベント処理でエラーが発生しました (kind={kind}): {ex.Message}");
        }
    }
}

// 🔢 数値プロパティを安全に取得する
static bool TryGetDouble(JsonElement root, string name, out double value)
{
    value = 0;
    return root.TryGetProperty(name, out var el) &&
           el.ValueKind == JsonValueKind.Number &&
           el.TryGetDouble(out value);
}

// 🔤 文字列プロパティを安全に取得する（無ければ空文字）
static string GetString(JsonElement root, string name) =>
    root.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String
        ? el.GetString() ?? ""
        : "";

// 🔢 整数プロパティを安全に取得する（無ければ既定値）
static int GetInt(JsonElement root, string name, int fallback) =>
    root.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out int v)
        ? v
        : fallback;

// ✂️ ログ用に文字列を120文字までで切り詰める
static string Truncate(string s) => s.Length <= 120 ? s : s[..120] + "…";
