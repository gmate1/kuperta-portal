import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { asyncHandler, validate, HttpError } from '../middleware/index.js';
import { calcTotals } from '../utils/money.js';
import { audit } from '../utils/audit.js';

const router = Router();

const itemSchema = z.object({
  service_id: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(1e6),
  unit: z.string().trim().min(1).max(30),
  unit_price: z.coerce.number().min(0).max(1e11),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  vat_rate: z.coerce.number().min(0).max(100),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum: ÉÉÉÉ-HH-NN');

const quoteSchema = z
  .object({
    client_id: z.coerce.number().int().positive(),
    issue_date: isoDate,
    valid_until: isoDate,
    notes: z.string().trim().max(5000).optional().nullable(),
    items: z.array(itemSchema).min(1, 'Legalább egy tétel kell').max(200),
  })
  .refine((q) => q.valid_until >= q.issue_date, {
    message: 'Az érvényesség nem lehet korábbi a kiállításnál',
    path: ['valid_until'],
  });

const idParam = z.object({ id: z.coerce.number().int().positive() });

// Megengedett státuszváltások – egyszerű állapotgép
const TRANSITIONS = {
  draft: ['sent'],
  sent: ['accepted', 'rejected', 'expired', 'draft'],
  accepted: [],
  rejected: ['draft'],
  expired: ['draft'],
};

/** Évente újrainduló sorszám, tranzakción belül (sorzár az upsert miatt). */
async function nextQuoteNumber(db, issueDate) {
  const year = Number(issueDate.slice(0, 4));
  const { rows } = await db.query(
    `INSERT INTO quote_counters (year, last_num) VALUES ($1, 1)
     ON CONFLICT (year) DO UPDATE SET last_num = quote_counters.last_num + 1
     RETURNING last_num`,
    [year],
  );
  return `AJ-${year}-${String(rows[0].last_num).padStart(4, '0')}`;
}

async function insertItems(db, quoteId, lines) {
  for (const [i, l] of lines.entries()) {
    await db.query(
      `INSERT INTO quote_items (quote_id, service_id, position, description, quantity, unit,
         unit_price, discount_pct, vat_rate, line_net, line_vat, line_gross)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [quoteId, l.service_id ?? null, i + 1, l.description, l.quantity, l.unit, l.unit_price,
        l.discount_pct, l.vat_rate, l.line_net, l.line_vat, l.line_gross],
    );
  }
}

async function loadQuote(id) {
  const { rows } = await query(
    `SELECT q.*, c.name AS client_name, c.email AS client_email, c.address AS client_address,
            u.full_name AS created_by_name
     FROM quotes q
     JOIN clients c ON c.id = q.client_id
     LEFT JOIN users u ON u.id = q.created_by
     WHERE q.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const items = await query('SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY position', [id]);
  return { ...rows[0], items: items.rows };
}

router.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']).optional(),
      client_id: z.coerce.number().int().positive().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { status, client_id } = req.valid.query;
    const { rows } = await query(
      `SELECT q.id, q.quote_number, q.status, q.issue_date, q.valid_until,
              q.net_total, q.vat_total, q.gross_total, q.client_id, c.name AS client_name
       FROM quotes q JOIN clients c ON c.id = q.client_id
       WHERE ($1::text IS NULL OR q.status = $1) AND ($2::int IS NULL OR q.client_id = $2)
       ORDER BY q.created_at DESC`,
      [status ?? null, client_id ?? null],
    );
    res.json(rows);
  }),
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const quote = await loadQuote(req.valid.params.id);
    if (!quote) throw new HttpError(404, 'Árajánlat nem található');
    res.json(quote);
  }),
);

router.post(
  '/',
  validate({ body: quoteSchema }),
  asyncHandler(async (req, res) => {
    const q = req.valid.body;
    // Az összegeket MINDIG a szerver számolja – a kliens által küldött összeg nem számít
    const totals = calcTotals(q.items);
    const id = await withTransaction(async (db) => {
      const number = await nextQuoteNumber(db, q.issue_date);
      const { rows } = await db.query(
        `INSERT INTO quotes (quote_number, client_id, issue_date, valid_until, notes,
           net_total, vat_total, gross_total, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [number, q.client_id, q.issue_date, q.valid_until, q.notes,
          totals.net_total, totals.vat_total, totals.gross_total, req.user.id],
      );
      await insertItems(db, rows[0].id, totals.lines);
      await audit(req, 'create', 'quote', rows[0].id, { number }, db);
      return rows[0].id;
    });
    res.status(201).json(await loadQuote(id));
  }),
);

router.put(
  '/:id',
  validate({ params: idParam, body: quoteSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.valid.params;
    const q = req.valid.body;
    const totals = calcTotals(q.items);
    await withTransaction(async (db) => {
      const cur = await db.query('SELECT status FROM quotes WHERE id = $1 FOR UPDATE', [id]);
      if (!cur.rows[0]) throw new HttpError(404, 'Árajánlat nem található');
      if (cur.rows[0].status !== 'draft') {
        throw new HttpError(409, 'Csak piszkozat állapotú ajánlat szerkeszthető');
      }
      await db.query(
        `UPDATE quotes SET client_id=$2, issue_date=$3, valid_until=$4, notes=$5,
           net_total=$6, vat_total=$7, gross_total=$8, updated_at=now()
         WHERE id=$1`,
        [id, q.client_id, q.issue_date, q.valid_until, q.notes,
          totals.net_total, totals.vat_total, totals.gross_total],
      );
      await db.query('DELETE FROM quote_items WHERE quote_id = $1', [id]);
      await insertItems(db, id, totals.lines);
      await audit(req, 'update', 'quote', id, null, db);
    });
    res.json(await loadQuote(id));
  }),
);

router.patch(
  '/:id/status',
  validate({
    params: idParam,
    body: z.object({ status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']) }),
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.valid.params;
    const { status } = req.valid.body;
    await withTransaction(async (db) => {
      const cur = await db.query('SELECT status FROM quotes WHERE id = $1 FOR UPDATE', [id]);
      if (!cur.rows[0]) throw new HttpError(404, 'Árajánlat nem található');
      const from = cur.rows[0].status;
      if (!TRANSITIONS[from].includes(status)) {
        throw new HttpError(409, `Nem engedélyezett státuszváltás: ${from} → ${status}`);
      }
      await db.query('UPDATE quotes SET status=$2, updated_at=now() WHERE id=$1', [id, status]);
      await audit(req, 'status_change', 'quote', id, { from, to: status }, db);
    });
    res.json(await loadQuote(id));
  }),
);

router.post(
  '/:id/duplicate',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const src = await loadQuote(req.valid.params.id);
    if (!src) throw new HttpError(404, 'Árajánlat nem található');
    const today = new Date().toISOString().slice(0, 10);
    const validUntil = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const totals = calcTotals(src.items);
    const id = await withTransaction(async (db) => {
      const number = await nextQuoteNumber(db, today);
      const { rows } = await db.query(
        `INSERT INTO quotes (quote_number, client_id, issue_date, valid_until, notes,
           net_total, vat_total, gross_total, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [number, src.client_id, today, validUntil, src.notes,
          totals.net_total, totals.vat_total, totals.gross_total, req.user.id],
      );
      await insertItems(db, rows[0].id, totals.lines);
      await audit(req, 'duplicate', 'quote', rows[0].id, { from: src.id }, db);
      return rows[0].id;
    });
    res.status(201).json(await loadQuote(id));
  }),
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(
      `DELETE FROM quotes WHERE id = $1 AND status = 'draft'`,
      [req.valid.params.id],
    );
    if (!rowCount) throw new HttpError(409, 'Csak létező piszkozat törölhető');
    await audit(req, 'delete', 'quote', req.valid.params.id);
    res.status(204).end();
  }),
);

export default router;
