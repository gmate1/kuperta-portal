import pg from 'pg';
import { config } from './config.js';

// NUMERIC mezőket a pg alapból stringként adja vissza – így marad pontos.
// A frontend felé is stringként mennek, ott formázzuk.
// DATE típus (OID 1082) maradjon 'ÉÉÉÉ-HH-NN' string – különben a JS Date
// időzóna-konverziója egy nappal elcsúsztatja a dátumot.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

/** Tranzakció helper: a callback egy klienst kap, hiba esetén ROLLBACK. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
