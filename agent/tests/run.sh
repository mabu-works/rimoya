#!/usr/bin/env bash
# RimoyaAgent 純粋ロジックテストの実行（この VM / Linux 用）
set -euo pipefail
cd "$(dirname "$0")"

if [ -x "$HOME/workspace/tools/dotnet/dotnet" ]; then
  DOTNET="$HOME/workspace/tools/dotnet/dotnet"
else
  DOTNET="dotnet"
fi

export TMPDIR="${TMPDIR:-$HOME/workspace/tmp}"
mkdir -p "$TMPDIR"
export TAR_OPTIONS=--no-same-owner

RESTORE_OPT=()
if [ -d "$HOME/workspace/tools/nuget-local" ]; then
  RESTORE_OPT=(-p:RestoreSources="$HOME/workspace/tools/nuget-local")
fi

"$DOTNET" run -c Release "${RESTORE_OPT[@]}"
