using System.Runtime.InteropServices;

namespace RimoyaAgent;

/// <summary>
/// Windows の SendInput / SetCursorPos / GetSystemMetrics の P/Invoke 定義と、
/// 入力イベントの実行ヘルパー。換算だけの処理は InputMath に分離している。
///
/// 注意: 対応するモニターはプライマリモニターのみ。
/// 画面サイズは GetSystemMetrics(SM_CXSCREEN / SM_CYSCREEN) で取得し、
/// 正規化座標 (0..1) はプライマリ画面に対するものとして扱う。
/// </summary>
internal static class NativeInput
{
    // ------------------------------------------
    // 🔢 定数
    // ------------------------------------------
    private const int SM_CXSCREEN = 0;
    private const int SM_CYSCREEN = 1;

    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;

    private const uint MOUSEEVENTF_MOVE = 0x0001;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;

    private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    // ------------------------------------------
    // 🧱 P/Invoke 構造体
    // ------------------------------------------
    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public INPUTUNION U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct INPUTUNION
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    // ------------------------------------------
    // 🔌 P/Invoke 関数
    // ------------------------------------------
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    private static readonly int InputSize = Marshal.SizeOf<INPUT>();

    // ------------------------------------------
    // 🖥️ 画面サイズ（プライマリモニター）
    // ------------------------------------------
    public static int ScreenWidth => GetSystemMetrics(SM_CXSCREEN);
    public static int ScreenHeight => GetSystemMetrics(SM_CYSCREEN);

    // ------------------------------------------
    // 🖱️ マウス移動（正規化座標 0..1 → プライマリ画面のピクセル）
    // ------------------------------------------
    public static void MoveMouse(double nx, double ny)
    {
        int w = ScreenWidth;
        int h = ScreenHeight;
        if (w <= 0 || h <= 0) return;
        SetCursorPos(InputMath.PixelFromNormalized(nx, w), InputMath.PixelFromNormalized(ny, h));
    }

    // ------------------------------------------
    // 🖱️ マウスボタン（0=左, 1=中, 2=右）
    // ------------------------------------------
    public static void MouseButton(int button, bool down)
    {
        uint flag = (button, down) switch
        {
            (0, true) => MOUSEEVENTF_LEFTDOWN,
            (0, false) => MOUSEEVENTF_LEFTUP,
            (1, true) => MOUSEEVENTF_MIDDLEDOWN,
            (1, false) => MOUSEEVENTF_MIDDLEUP,
            (2, true) => MOUSEEVENTF_RIGHTDOWN,
            (2, false) => MOUSEEVENTF_RIGHTUP,
            _ => 0u,
        };
        if (flag == 0) return;
        SendMouse(flag, 0);
    }

    // ------------------------------------------
    // 🎡 ホイール
    // ------------------------------------------
    public static void Wheel(double deltaY)
    {
        int wheel = InputMath.WheelDelta(deltaY);
        if (wheel == 0) return;
        SendMouse(MOUSEEVENTF_WHEEL, unchecked((uint)wheel));
    }

    // 🖱️ マウス入力を1件送る
    private static void SendMouse(uint flags, uint mouseData)
    {
        var input = new INPUT
        {
            type = INPUT_MOUSE,
            U = new INPUTUNION
            {
                mi = new MOUSEINPUT
                {
                    dx = 0,
                    dy = 0,
                    mouseData = mouseData,
                    dwFlags = flags,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero,
                },
            },
        };
        SendInput(1, new[] { input }, InputSize);
    }

    // ------------------------------------------
    // ⌨️ キー（VK コード）
    // ------------------------------------------
    public static void Key(ushort vk, bool down, bool extended)
    {
        uint flags = 0;
        if (extended) flags |= KEYEVENTF_EXTENDEDKEY;
        if (!down) flags |= KEYEVENTF_KEYUP;
        var input = new INPUT
        {
            type = INPUT_KEYBOARD,
            U = new INPUTUNION
            {
                ki = new KEYBDINPUT
                {
                    wVk = vk,
                    wScan = 0,
                    dwFlags = flags,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero,
                },
            },
        };
        SendInput(1, new[] { input }, InputSize);
    }

    // ------------------------------------------
    // ⌨️ テキスト入力（KEYEVENTF_UNICODE、日本語などの直接入力用）
    // ------------------------------------------
    public static void Text(string text)
    {
        if (string.IsNullOrEmpty(text)) return;
        var inputs = new INPUT[text.Length * 2];
        for (int i = 0; i < text.Length; i++)
        {
            ushort unit = text[i]; // UTF-16 コードユニット単位で送る（サロゲートペアもそのまま）
            inputs[i * 2] = UnicodeKey(unit, keyUp: false);
            inputs[i * 2 + 1] = UnicodeKey(unit, keyUp: true);
        }
        SendInput((uint)inputs.Length, inputs, InputSize);
    }

    // ⌨️ Unicode キー入力を1件作る
    private static INPUT UnicodeKey(ushort scan, bool keyUp)
    {
        uint flags = KEYEVENTF_UNICODE;
        if (keyUp) flags |= KEYEVENTF_KEYUP;
        return new INPUT
        {
            type = INPUT_KEYBOARD,
            U = new INPUTUNION
            {
                ki = new KEYBDINPUT
                {
                    wVk = 0,
                    wScan = scan,
                    dwFlags = flags,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero,
                },
            },
        };
    }
}
