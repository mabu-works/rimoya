#!/usr/bin/env bash
# RimoyaAgent ワンコマンドビルド（この VM / Linux 用）
# publish まで実行し、成果物パスを表示する。
set -euo pipefail
cd "$(dirname "$0")"

# .NET SDK: この VM では ~/workspace/tools/dotnet、それ以外は PATH の dotnet
if [ -x "$HOME/workspace/tools/dotnet/dotnet" ]; then
  DOTNET="$HOME/workspace/tools/dotnet/dotnet"
else
  DOTNET="dotnet"
fi

# この VM の癖: /tmp は小さい tmpfs なので TMPDIR を workspace 配下に向ける
export TMPDIR="${TMPDIR:-$HOME/workspace/tmp}"
mkdir -p "$TMPDIR"
export TAR_OPTIONS=--no-same-owner

# NuGet restore はローカルの事前ダウンロード済みパッケージだけを使う（プロキシ詰まり回避）
RESTORE_OPT=()
if [ -d "$HOME/workspace/tools/nuget-local" ]; then
  RESTORE_OPT=(-p:RestoreSources="$HOME/workspace/tools/nuget-local")
fi

"$DOTNET" publish -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true \
  "${RESTORE_OPT[@]}" -o dist

echo "成果物: $(pwd)/dist/RimoyaAgent.exe"
