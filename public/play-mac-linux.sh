#!/usr/bin/env bash
# The Amazing Digital Circus - play on your own Mac or Linux computer with your own Claude account.
# The first time it downloads the game into ~/AmazingDigitalCircus and sets up everything it needs by itself (a private Python if the
# computer has none, Anthropic's Claude Code) and opens Anthropic's sign-in page; after that it starts straight away (every start
# first checks for a new version). Ctrl+C or closing the window stops the game.
DIR="$HOME/AmazingDigitalCircus"; GAME="$DIR/game"; STAMP="$DIR/version.txt"
mkdir -p "$DIR" || exit 1
# every start checks the newest version of the game and downloads it only when it changed
LATEST="$(curl -fsSL --max-time 8 -H "User-Agent: amazing-digital-circus-launcher" https://api.github.com/repos/guestcoder0906/the-amazing-simulation/commits/main 2>/dev/null | grep -m1 '"sha"' | sed -E 's/.*"sha": *"([0-9a-f]+)".*//')"
HAVE="$(cat "$STAMP" 2>/dev/null)"
if [ ! -f "$GAME/play-local.sh" ] || { [ -n "$LATEST" ] && [ "$LATEST" != "$HAVE" ]; }; then
  echo "Downloading the latest version of the game..."
  TMP="$(mktemp -d)"
  if curl -fsSL "https://github.com/guestcoder0906/the-amazing-simulation/archive/refs/heads/main.tar.gz" | tar -xz -C "$TMP"; then
    NEW="$(ls -d "$TMP"/*/ | head -1)"
    [ -d "$GAME/runtime" ] && mv "$GAME/runtime" "$NEW/runtime"   # keep the private Python between updates
    rm -rf "$GAME"; mv "$NEW" "$GAME"; [ -n "$LATEST" ] && echo "$LATEST" > "$STAMP"
  elif [ -f "$GAME/play-local.sh" ]; then echo "Could not update right now - starting the copy you already have."
  else echo "Could not download the game: check your internet connection and try again."; rm -rf "$TMP"; exit 1; fi
  rm -rf "$TMP"
fi
cd "$GAME" || exit 1
# run from a pasted command (stdin is the script itself) or from the double-clicked file alike: the game's questions read the keyboard
if [ -t 0 ]; then exec bash ./play-local.sh; else exec bash ./play-local.sh </dev/tty; fi
