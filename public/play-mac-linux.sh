#!/usr/bin/env bash
# The Amazing Digital Circus - play on your own Mac or Linux computer with your own Claude account.
# Run:  curl -fsSL <this site>/play-mac-linux.sh | bash
# The first time it downloads the game into ~/AmazingDigitalCircus, sets up Anthropic's Claude Code and opens its sign-in page;
# after that it starts straight away (and fetches updates once a week). Ctrl+C stops the game.
set -e
DIR="$HOME/AmazingDigitalCircus"; GAME="$DIR/game"; STAMP="$DIR/updated.txt"
mkdir -p "$DIR"
if [ ! -f "$GAME/play-local.sh" ] || [ -z "$(find "$STAMP" -mtime -7 2>/dev/null)" ]; then
  echo "Downloading the game (first time or weekly update)..."
  TMP="$(mktemp -d)"
  if curl -fsSL "https://github.com/guestcoder0906/the-amazing-simulation/archive/refs/heads/main.tar.gz" | tar -xz -C "$TMP"; then
    rm -rf "$GAME"; mv "$TMP"/* "$GAME"; date > "$STAMP"
  elif [ -f "$GAME/play-local.sh" ]; then echo "Could not update right now - starting the copy you already have."
  else echo "Could not download the game: check your internet connection and run the command again."; exit 1; fi
  rm -rf "$TMP"
fi
cd "$GAME" && exec bash ./play-local.sh </dev/tty
