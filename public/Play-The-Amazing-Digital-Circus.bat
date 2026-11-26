@echo off
rem The Amazing Digital Circus - one file to play on your own computer with your own Claude account.
rem Double-click it. The first time it downloads the game (into your user folder), sets up what it needs and opens Anthropic's
rem sign-in page; after that it starts the game straight away (and fetches updates once a week). Close the window to stop.
setlocal
title The Amazing Digital Circus
set "DIR=%LOCALAPPDATA%\AmazingDigitalCircus"
set "GAME=%DIR%\game"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $d=$env:DIR; $g=$env:GAME; $stamp=Join-Path $d 'updated.txt'; $fresh = (Test-Path (Join-Path $g 'play-local.bat')) -and (Test-Path $stamp) -and (((Get-Date) - (Get-Item $stamp).LastWriteTime).TotalDays -lt 7); if ($fresh) { exit 0 }; New-Item -ItemType Directory -Force $d | Out-Null; try { Write-Host 'Downloading the game (first time or weekly update)...'; $z=Join-Path $d 'game.zip'; Invoke-WebRequest 'https://github.com/guestcoder0906/the-amazing-simulation/archive/refs/heads/main.zip' -OutFile $z -UseBasicParsing; $t=Join-Path $d 'new'; if (Test-Path $t) { Remove-Item -Recurse -Force $t }; Expand-Archive $z -DestinationPath $t -Force; Remove-Item $z; $src=Get-ChildItem $t | Select-Object -First 1; $rt=Join-Path $g 'runtime'; $keep=Join-Path $d 'runtime'; if (Test-Path $rt) { if (Test-Path $keep) { Remove-Item -Recurse -Force $keep }; Move-Item $rt $keep }; if (Test-Path $g) { Remove-Item -Recurse -Force $g }; Move-Item $src.FullName $g; Remove-Item -Recurse -Force $t; if (Test-Path $keep) { Move-Item $keep (Join-Path $g 'runtime') }; Set-Content $stamp (Get-Date) } catch { if (Test-Path (Join-Path $g 'play-local.bat')) { Write-Host 'Could not update right now - starting the copy you already have.' } else { Write-Host ('Could not download the game: ' + $_.Exception.Message); exit 1 } }"
if errorlevel 1 (
  echo.
  echo Check your internet connection and double-click this file again.
  pause
  exit /b 1
)
call "%GAME%\play-local.bat"
