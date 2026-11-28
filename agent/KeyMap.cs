namespace RimoyaAgent;

/// <summary>
/// JS の KeyboardEvent.code → Windows 仮想キー（VK）コードの対応表。
/// Extended=true のキーは KEYEVENTF_EXTENDEDKEY を付けて送る必要がある。
/// </summary>
internal static class KeyMap
{
    public readonly record struct KeyInfo(ushort Vk, bool Extended);

    private static readonly Dictionary<string, KeyInfo> Table = BuildTable();

    // 🔍 キーコードから VK 情報を取得する
    public static bool TryGet(string code, out KeyInfo info) => Table.TryGetValue(code, out info);

    // 🗺️ 対応表を作る
    private static Dictionary<string, KeyInfo> BuildTable()
    {
        var table = new Dictionary<string, KeyInfo>(StringComparer.Ordinal);
        void Add(string code, ushort vk, bool ext = false) => table[code] = new KeyInfo(vk, ext);

        // 🔤 英字 KeyA..KeyZ → VK 0x41..0x5A
        for (int i = 0; i < 26; i++)
            Add("Key" + (char)('A' + i), (ushort)(0x41 + i));
        // 🔢 数字 Digit0..Digit9 → VK 0x30..0x39
        for (int i = 0; i <= 9; i++)
            Add("Digit" + i, (ushort)(0x30 + i));
        // 🔢 ファンクションキー F1..F12 → VK 0x70..0x7B
        for (int i = 1; i <= 12; i++)
            Add("F" + i, (ushort)(0x70 + i - 1));
        // 🔢 テンキー Numpad0..Numpad9 → VK 0x60..0x69
        for (int i = 0; i <= 9; i++)
            Add("Numpad" + i, (ushort)(0x60 + i));

        Add("Enter", 0x0D);
        Add("NumpadEnter", 0x0D, ext: true);
        Add("Escape", 0x1B);
        Add("Tab", 0x09);
        Add("Space", 0x20);
        Add("Backspace", 0x08);
        Add("Delete", 0x2E, ext: true);
        Add("Insert", 0x2D, ext: true);
        Add("Home", 0x24, ext: true);
        Add("End", 0x23, ext: true);
        Add("PageUp", 0x21, ext: true);
        Add("PageDown", 0x22, ext: true);
        Add("ArrowLeft", 0x25, ext: true);
        Add("ArrowUp", 0x26, ext: true);
        Add("ArrowRight", 0x27, ext: true);
        Add("ArrowDown", 0x28, ext: true);

        Add("ShiftLeft", 0xA0);
        Add("ShiftRight", 0xA1, ext: true);
        Add("ControlLeft", 0xA2);
        Add("ControlRight", 0xA3, ext: true);
        Add("AltLeft", 0xA4);
        Add("AltRight", 0xA5, ext: true);
        Add("MetaLeft", 0x5B);
        Add("MetaRight", 0x5C, ext: true);
        Add("CapsLock", 0x14);

        // 🔣 主な記号キー（US 配列の VK コード）
        Add("Minus", 0xBD);
        Add("Equal", 0xBB);
        Add("BracketLeft", 0xDB);
        Add("BracketRight", 0xDD);
        Add("Backslash", 0xDC);
        Add("Semicolon", 0xBA);
        Add("Quote", 0xDE);
        Add("Comma", 0xBC);
        Add("Period", 0xBE);
        Add("Slash", 0xBF);
        Add("Backquote", 0xC0);

        // 🔢 テンキーの演算子など
        Add("NumpadMultiply", 0x6A);
        Add("NumpadAdd", 0x6B);
        Add("NumpadSubtract", 0x6D);
        Add("NumpadDecimal", 0x6E);
        Add("NumpadDivide", 0x6F, ext: true);

        return table;
    }
}
