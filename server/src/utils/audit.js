import { query } from '../db.js';

/** Audit napló bejegyzés. Hibája nem állítja meg a kérést, csak logolódik. */
export async function audit(req, action, entity, entityId = null, meta = null, db = { query }) {
  try {
    await db.query(
      'INSERT INTO audit_log (user_id, action, entity, entity_id, ip, meta) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user?.id ?? null, action, entity, entityId, req.ip, meta ? JSON.stringify(meta) : null],
    );
  } catch (err) {
    console.error('Audit napló hiba:', err.message);
  }
}
