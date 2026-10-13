import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler, validate, HttpError } from '../middleware/index.js';
import { calcExpense } from '../utils/money.js';
import { audit } from '../utils/audit.js';

const router = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dátum: ÉÉÉÉ-HH-NN');

const expenseSchema = z.object({
  category_id: z.coerce.number().int().positive(),
  client_id: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().trim().min(1).max(500),
  supplier: z.string().trim().max(200).optional().nullable(),
  expense_date: isoDate,
  amount_net: z.coerce.number().min(0).max(1e11),
  vat_rate: z.coerce.number().min(0).max(100).default(27),
});

const rangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  category_id: z.coerce.number().int().positive().optional(),
});

router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM expense_categories ORDER BY name');
    res.json(rows);
  }),
);

router.get(
  '/',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const { from, to, category_id } = req.valid.query;
    const { rows } = await query(
      `SELECT e.*, ec.name AS category_name, c.name AS client_name
       FROM expenses e
       JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN clients c ON c.id = e.client_id
       WHERE ($1::date IS NULL OR e.expense_date >= $1)
         AND ($2::date IS NULL OR e.expense_date <= $2)
         AND ($3::int IS NULL OR e.category_id = $3)
       ORDER BY e.expense_date DESC, e.id DESC`,
      [from ?? null, to ?? null, category_id ?? null],
    );
    res.json(rows);
  }),
);

// Összesítés kategóriánként és havonta – a dashboard és riportok alapja
router.get(
  '/summary',
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const { from, to } = req.valid.query;
    const params = [from ?? null, to ?? null];
    const where = `($1::date IS NULL OR e.expense_date >= $1) AND ($2::date IS NULL OR e.expense_date <= $2)`;
    const [byCategory, byMonth] = await Promise.all([
      query(
        `SELECT ec.name AS category, sum(e.amount_net) AS net, sum(e.amount_gross) AS gross
         FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
         WHERE ${where} GROUP BY ec.name ORDER BY gross DESC`,
        params,
      ),
      query(
        `SELECT to_char(date_trunc('month', e.expense_date), 'YYYY-MM') AS month,
                sum(e.amount_net) AS net, sum(e.amount_gross) AS gross
         FROM expenses e WHERE ${where} GROUP BY 1 ORDER BY 1`,
        params,
      ),
    ]);
    res.json({ byCategory: byCategory.rows, byMonth: byMonth.rows });
  }),
);

router.post(
  '/',
  validate({ body: expenseSchema }),
  asyncHandler(async (req, res) => {
    const e = req.valid.body;
    const { amount_vat, amount_gross } = calcExpense(e.amount_net, e.vat_rate);
    const { rows } = await query(
      `INSERT INTO expenses (category_id, client_id, description, supplier, expense_date,
         amount_net, vat_rate, amount_vat, amount_gross, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [e.category_id, e.client_id ?? null, e.description, e.supplier, e.expense_date,
        e.amount_net, e.vat_rate, amount_vat, amount_gross, req.user.id],
    );
    await audit(req, 'create', 'expense', rows[0].id);
    res.status(201).json(rows[0]);
  }),
);

router.delete(
  '/:id',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('DELETE FROM expenses WHERE id = $1', [req.valid.params.id]);
    if (!rowCount) throw new HttpError(404, 'Költség nem található');
    await audit(req, 'delete', 'expense', req.valid.params.id);
    res.status(204).end();
  }),
);

export default router;
