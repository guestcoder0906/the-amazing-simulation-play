import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two pages: index.html (the game as a Claude artifact, on the player's own Claude account) and game.html (the same game
// on the site's Claude: the owner's CLAUDE_API_KEY through api/claude.ts).
export default defineConfig({
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), game: resolve(__dirname, 'game.html') } } },
});
