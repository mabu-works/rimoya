using RimoyaAgent;

// ==========================================
// 🧪 RimoyaAgent 純粋ロジックのテスト
// ==========================================
// Windows API を呼ばない換算・対応表だけを検証する簡易ランナー。
// 失敗があれば件数を表示して終了コード 1 で終わる。

int failures = 0;

void Check(bool condition, string name)
{
    if (!condition)
    {
        failures++;
        Console.WriteLine($"FAIL: {name}");
    }
}

void Eq<T>(T expected, T actual, string name) =>
    Check(EqualityComparer<T>.Default.Equals(expected, actual),
          $"{name} (expected={expected}, actual={actual})");

// ------------------------------------------
// 📍 PixelFromNormalized（1920x1080 前提）
// ------------------------------------------
Eq(0, InputMath.PixelFromNormalized(0.0, 1920), "left edge maps to 0");
Eq(1919, InputMath.PixelFromNormalized(1.0, 1920), "right edge maps to width-1");
Eq(960, InputMath.PixelFromNormalized(0.5, 1920), "center x"); // Round(959.5) = 960 (banker's rounding)
Eq(0, InputMath.PixelFromNormalized(-0.25, 1920), "below range clamps to 0");
Eq(1919, InputMath.PixelFromNormalized(1.25, 1920), "above range clamps to width-1");
Eq(0, InputMath.PixelFromNormalized(0.0, 1080), "top edge maps to 0");
Eq(1079, InputMath.PixelFromNormalized(1.0, 1080), "bottom edge maps to height-1");

// ------------------------------------------
// 🎡 WheelDelta（符号反転と最小単位）
// ------------------------------------------
Eq(-100, InputMath.WheelDelta(100), "down scroll 100 -> -100");
Eq(100, InputMath.WheelDelta(-100), "up scroll -100 -> +100");
Eq(0, InputMath.WheelDelta(0), "no scroll -> 0 (send nothing)");
Eq(-120, InputMath.WheelDelta(0.4), "tiny down scroll -> -120");
Eq(120, InputMath.WheelDelta(-0.4), "tiny up scroll -> +120");
Eq(-2, InputMath.WheelDelta(2.5), "2.5 -> Round(-2.5) = -2 (banker's rounding)");
Eq(-2, InputMath.WheelDelta(1.5), "1.5 -> Round(-1.5) = -2 (banker's rounding)");
Eq(-4, InputMath.WheelDelta(3.5), "3.5 -> Round(-3.5) = -4 (banker's rounding)");

// ------------------------------------------
// ⌨️ KeyMap（VK コードと拡張キー）
// ------------------------------------------
Check(KeyMap.TryGet("KeyA", out var keyA) && keyA.Vk == 0x41 && !keyA.Extended, "KeyA -> VK 0x41");
Check(KeyMap.TryGet("KeyZ", out var keyZ) && keyZ.Vk == 0x5A && !keyZ.Extended, "KeyZ -> VK 0x5A");
Check(KeyMap.TryGet("Digit0", out var d0) && d0.Vk == 0x30, "Digit0 -> VK 0x30");
Check(KeyMap.TryGet("Digit9", out var d9) && d9.Vk == 0x39, "Digit9 -> VK 0x39");
Check(KeyMap.TryGet("F1", out var f1) && f1.Vk == 0x70, "F1 -> VK 0x70");
Check(KeyMap.TryGet("F12", out var f12) && f12.Vk == 0x7B, "F12 -> VK 0x7B");
Check(KeyMap.TryGet("Numpad0", out var n0) && n0.Vk == 0x60, "Numpad0 -> VK 0x60");
Check(KeyMap.TryGet("Enter", out var enter) && enter.Vk == 0x0D && !enter.Extended, "Enter -> VK 0x0D, not extended");
Check(KeyMap.TryGet("NumpadEnter", out var nEnter) && nEnter.Vk == 0x0D && nEnter.Extended, "NumpadEnter -> VK 0x0D, extended");
Check(KeyMap.TryGet("ArrowLeft", out var left) && left.Vk == 0x25 && left.Extended, "ArrowLeft -> VK 0x25, extended");
Check(KeyMap.TryGet("Delete", out var del) && del.Vk == 0x2E && del.Extended, "Delete -> VK 0x2E, extended");
Check(KeyMap.TryGet("ShiftLeft", out var shL) && shL.Vk == 0xA0 && !shL.Extended, "ShiftLeft -> VK 0xA0, not extended");
Check(KeyMap.TryGet("ShiftRight", out var shR) && shR.Vk == 0xA1 && shR.Extended, "ShiftRight -> VK 0xA1, extended");
Check(KeyMap.TryGet("ControlRight", out var ctR) && ctR.Vk == 0xA3 && ctR.Extended, "ControlRight -> VK 0xA3, extended");
Check(KeyMap.TryGet("NumpadDivide", out var nDiv) && nDiv.Vk == 0x6F && nDiv.Extended, "NumpadDivide -> VK 0x6F, extended");
Check(KeyMap.TryGet("Space", out var sp) && sp.Vk == 0x20, "Space -> VK 0x20");
Check(KeyMap.TryGet("Backquote", out var bq) && bq.Vk == 0xC0, "Backquote -> VK 0xC0");
Check(!KeyMap.TryGet("keya", out _), "lowercase code is unknown");
Check(!KeyMap.TryGet("MediaPlayPause", out _), "unmapped code is unknown");
Check(!KeyMap.TryGet("", out _), "empty code is unknown");

if (failures > 0)
{
    Console.WriteLine($"{failures} test(s) FAILED");
    return 1;
}
Console.WriteLine("All agent logic tests passed.");
return 0;
