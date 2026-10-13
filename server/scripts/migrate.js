// Egyszerű migrációs futtató: a db/migrations/*.sql fájlokat sorrendben,
// egyszer futtatja le, és a schema_migrations táblában tartja nyilván.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✔ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✘ ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

main();
