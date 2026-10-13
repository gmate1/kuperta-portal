import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler, validate, requireRole, HttpError } from '../middleware/index.js';
import { encrypt, decrypt, maskTaxNumber } from '../utils/crypto.js';
import { audit } from '../utils/audit.js';

const router = Router();

// Magyar adószám (céges: 12345678-1-42) vagy adóazonosító jel (magánszemély: 10 számjegy)
const taxNumber = z
  .string()
  .trim()
  .regex(/^(\d{8}-\d-\d{2}|\d{10})$/, 'Formátum: 12345678-1-42 vagy 10 jegyű adóazonosító')
  .optional()
  .or(z.literal('').transform(() => undefined));

const optStr = (max) => z.string().trim().max(max).optional().nullable();

const clientSchema = z.object({
  name: z.string().trim().min(2).max(200),
  client_type: z.enum(['company', 'individual']).default('company'),
  tax_number: taxNumber,
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  phone: optStr(50),
  address: optStr(500),
  notes: optStr(5000),
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** DB sor → API válasz. full=true esetén a teljes adószám visszafejtve. */
function toDto(row, full = false) {
  const { tax_number_enc, ...rest } = row;
  const tax = decrypt(tax_number_enc);
  return { ...rest, tax_number: full ? tax : maskTaxNumber(tax) };
}

router.get(
  '/',
  validate({ query: z.object({ q: z.string().trim().max(100).optional() }) }),
  asyncHandler(async (req, res) => {
    const { q } = req.valid.query;
    const { rows } = await query(
      `SELECT c.*, (SELECT count(*)::int FROM quotes WHERE client_id = c.id) AS quote_count
       FROM clients c
       WHERE ($1::text IS NULL OR c.name ILIKE '%' || $1 || '%' OR c.email ILIKE '%' || $1 || '%')
       ORDER BY c.name`,
      [q || null],
    );
    res.json(rows.map((r) => toDto(r)));
  }),
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM clients WHERE id = $1', [req.valid.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Ügyfél nem található');
    // A teljes adószám megtekintése naplózott hozzáférés
    await audit(req, 'view_sensitive', 'client', rows[0].id);
    res.json(toDto(rows[0], true));
  }),
);

router.post(
  '/',
  validate({ body: clientSchema }),
  asyncHandler(async (req, res) => {
    const c = req.valid.body;
    const { rows } = await query(
      `INSERT INTO clients (name, client_type, tax_number_enc, email, phone, address, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [c.name, c.client_type, encrypt(c.tax_number), c.email || null, c.phone, c.address, c.notes, req.user.id],
    );
    await audit(req, 'create', 'client', rows[0].id);
    res.status(201).json(toDto(rows[0], true));
  }),
);

router.put(
  '/:id',
  validate({ params: idParam, body: clientSchema }),
  asyncHandler(async (req, res) => {
    const c = req.valid.body;
    const { rows } = await query(
      `UPDATE clients SET name=$2, client_type=$3, tax_number_enc=$4, email=$5, phone=$6,
         address=$7, notes=$8, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.valid.params.id, c.name, c.client_type, encrypt(c.tax_number), c.email || null, c.phone, c.address, c.notes],
    );
    if (!rows[0]) throw new HttpError(404, 'Ügyfél nem található');
    await audit(req, 'update', 'client', rows[0].id);
    res.json(toDto(rows[0], true));
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    // Ha van árajánlata, az FK (ON DELETE RESTRICT) megakadályozza → 409
    const { rowCount } = await query('DELETE FROM clients WHERE id = $1', [req.valid.params.id]);
    if (!rowCount) throw new HttpError(404, 'Ügyfél nem található');
    await audit(req, 'delete', 'client', req.valid.params.id);
    res.status(204).end();
  }),
);

export default router;
