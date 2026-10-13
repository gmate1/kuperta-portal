import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler, validate, requireRole, HttpError } from '../middleware/index.js';
import { audit } from '../utils/audit.js';

const router = Router();

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  unit: z.string().trim().min(1).max(30),
  unit_price: z.coerce.number().min(0).max(1e11),
  vat_rate: z.coerce.number().min(0).max(100),
  is_active: z.boolean().default(true),
});

router.get(
  '/',
  validate({ query: z.object({ all: z.enum(['true', 'false']).optional() }) }),
  asyncHandler(async (req, res) => {
    const all = req.valid.query.all === 'true';
    const { rows } = await query(
      `SELECT * FROM services WHERE ($1 OR is_active) ORDER BY name`,
      [all],
    );
    res.json(rows);
  }),
);

router.post(
  '/',
  requireRole('admin'),
  validate({ body: serviceSchema }),
  asyncHandler(async (req, res) => {
    const s = req.valid.body;
    const { rows } = await query(
      `INSERT INTO services (name, description, unit, unit_price, vat_rate, is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [s.name, s.description, s.unit, s.unit_price, s.vat_rate, s.is_active],
    );
    await audit(req, 'create', 'service', rows[0].id);
    res.status(201).json(rows[0]);
  }),
);

router.put(
  '/:id',
  requireRole('admin'),
  validate({ params: z.object({ id: z.coerce.number().int().positive() }), body: serviceSchema }),
  asyncHandler(async (req, res) => {
    const s = req.valid.body;
    const { rows } = await query(
      `UPDATE services SET name=$2, description=$3, unit=$4, unit_price=$5, vat_rate=$6, is_active=$7
       WHERE id=$1 RETURNING *`,
      [req.valid.params.id, s.name, s.description, s.unit, s.unit_price, s.vat_rate, s.is_active],
    );
    if (!rows[0]) throw new HttpError(404, 'Szolgáltatás nem található');
    await audit(req, 'update', 'service', rows[0].id);
    res.json(rows[0]);
  }),
);

export default router;
