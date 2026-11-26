# The Amazing Digital Circus: play

The 3D world and character sandbox from [the-amazing-simulation](https://github.com/guestcoder0906/the-amazing-simulation), ready to play.

## Two ways to play

| Page | Claude | Limits |
|---|---|---|
| `index.html` (start page) | The game runs as a **Claude artifact**, on each player's **own Claude account** (signed in at claude.ai). No API key. | The player's own Claude plan |
| `game.html` | The **site's Claude**: the owner's `CLAUDE_API_KEY`, through `api/claude.ts` (the key never reaches the browser) | Shared by everyone who plays this way; may stop working |

When a player is not signed in to Claude (or does not allow Claude for the game), the start page asks them to log in to Claude.
If they decline, it first warns that the game will use the site's Claude, with limits shared by everyone, and then opens `game.html`.
If the site's Claude does not work, `game.html` says so and offers signing in to Claude instead.

## Set up

1. The artifact must be shared as **Anyone with the link**. Put its embed link (Share -> Embed) in `EMBED_SRC` in `index.html`.
2. Deploy on Vercel (import this repository). Add `CLAUDE_API_KEY` (and optionally `GEMINI_API_KEY`) under Project Settings -> Environment Variables.

Only `index.html` can be hosted anywhere static (GitHub Pages works); `game.html` needs Vercel for `api/claude.ts`.
