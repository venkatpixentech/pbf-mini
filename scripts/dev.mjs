// npm run dev -- <gameId>   Serves one game, as each game opens on its own.
import { createServer } from 'vite';

process.env.GAME_ID = process.argv[2] ?? process.env.GAME_ID;
const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
console.log(`\n  ${process.env.GAME_ID}`);
server.printUrls();
