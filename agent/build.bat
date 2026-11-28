@echo off
rem RimoyaAgent ワンコマンドビルド（Windows 用）
rem publish まで実行し、成果物パスを表示する。
cd /d %~dp0

dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -o dist
if errorlevel 1 (
  echo ビルドに失敗しました。
  exit /b 1
)

echo 成果物: %CD%\dist\RimoyaAgent.exe
