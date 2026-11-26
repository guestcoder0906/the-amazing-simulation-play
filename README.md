# The Amazing Digital Circus: play

The 3D world and character sandbox from [the-amazing-simulation](https://github.com/guestcoder0906/the-amazing-simulation), ready to play.

## Two ways to play

| Page | Claude | Limits |
|---|---|---|
| `index.html` (start page) | The game runs as a **Claude artifact**, on each player's **own Claude account** (signed in at claude.ai). No API key. | The player's own Claude plan |
| `game.html` | The **site's Claude**: the owner's `CLAUDE_API_KEY`, through `api/claude.ts` (the key never reaches the browser) | Shared by everyone who plays this way; may stop working |

The start page offers playing on your Claude account (opens the artifact on claude.ai; Claude asks signed-out players to log in).
In the game, when Claude is not available (signed out, or Claude not allowed), it asks the player to sign in to Claude.
If they decline (on the start page or in the game), it first warns that the game will use the site's Claude, with limits shared by everyone, and then opens `game.html`.
If the site's Claude does not work, `game.html` says so and offers signing in to Claude instead.

## Set up

1. The artifact must be shared as **Anyone with the link** (its link is `ARTIFACT_URL` in `index.html`).
2. Deploy on Vercel: import this repository (framework Vite, no other settings). Add `CLAUDE_API_KEY` (and optionally
   `GEMINI_API_KEY`) under Project Settings -> Environment Variables, then redeploy.
3. If the Vercel address is not `https://the-amazing-simulation-play.vercel.app`, change `SITE_CLAUDE_URL` in the artifact
   (it links signed-out players to `game.html`).

Claude does not allow artifacts inside other websites (claude.ai only allows framing by itself), so "Play with Claude" opens
the game on claude.ai. Everything else runs on Vercel; `game.html` needs Vercel for `api/claude.ts`.
