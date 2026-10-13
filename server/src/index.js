import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`API fut: http://localhost:${config.port}`);
});

// Leállításnál (docker stop) lezárjuk a kapcsolatokat
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
