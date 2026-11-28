namespace RimoyaAgent;

/// <summary>
/// 入力イベントのうち、Windows API に依存しない純粋な換算ロジック。
/// 単体テスト（agent/tests）から直接検証できるように分離している。
/// </summary>
internal static class InputMath
{
    // 📍 正規化座標 (0..1) をプライマリ画面のピクセル座標へ変換する
    // 画面の右端・下端がちょうど 1.0 に対応するよう (size - 1) を掛ける。
    public static int PixelFromNormalized(double normalized, int screenSize)
    {
        double clamped = Math.Clamp(normalized, 0.0, 1.0);
        return (int)Math.Round(clamped * (screenSize - 1));
    }

    // 🎡 ブラウザの WheelEvent.deltaY を Windows のホイール量へ換算する
    // ブラウザは「下スクロールが正」、Windows は「上スクロールが正・120単位」
    // なので符号を反転する。丸めた結果が 0 でも、実際にスクロールがあれば
    // 最小単位（±120）を返す。戻り値 0 は「送らない」を意味する。
    public static int WheelDelta(double deltaY)
    {
        int wheel = (int)Math.Round(-deltaY);
        if (wheel != 0) return wheel;
        if (deltaY == 0) return 0;
        return deltaY < 0 ? 120 : -120;
    }
}
