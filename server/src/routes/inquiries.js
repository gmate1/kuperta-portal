import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { asyncHandler, validate, HttpError } from '../middleware/index.js';
import { audit } from '../utils/audit.js';
import { config } from '../config.js';

export const TOPICS = ['cashflow', 'tax', 'business_plan', 'grant', 'loan', 'other'];

// ─── Nyilvános végpont (a weboldal űrlapja) ────────────────────────────────
// Ez az egyetlen bejelentkezés nélkül írható végpont, ezért szigorúbb a védelme.
export const publicRouter = Router();

const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5, // IP-nként óránként 5 üzenet
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Túl sok üzenet érkezett erről a címről. Próbálja újra egy óra múlva.' },
});

const inquirySchema = z.object({
  name: z.string().trim().min(2, 'Adja meg a nevét').max(200),
  company: z.string().trim().max(200).optional().or(z.literal('')),
  email: z.string().trim().email('Érvénytelen email cím').max(255),
  phone: z.string().trim().max(50).regex(/^[0-9+()\-\s]*$/, 'Érvénytelen telefonszám').optional(),
  topic: z.enum(TOPICS),
  message: z.string().trim().min(10, 'Írjon legalább pár mondatot').max(3000),
  consent: z.literal(true, { errorMap: () => ({ message: 'Az adatkezelési tájékoztató elfogadása szükséges' }) }),
  // Honeypot: emberek számára láthatatlan mező. Ha ki van töltve, bot küldte.
  website: z.string().max(200).optional(),
});

publicRouter.post(
  '/inquiries',
  inquiryLimiter,
  validate({ body: inquirySchema }),
  asyncHandler(async (req, res) => {
    const b = req.valid.body;
    if (b.website) return res.status(202).json({ ok: true }); // botnak "sikeres", de nem mentjük
    await query(
      `INSERT INTO inquiries (name, company, email, phone, topic, message, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [b.name, b.company || null, b.email.toLowerCase(), b.phone || null, b.topic, b.message, req.ip],
    );
    res.status(201).json({ ok: true });
  }),
);

// A weboldal árlistája a portál szolgáltatás-katalógusából jön (élő adat)
publicRouter.get(
  '/services',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, name, description, unit, unit_price FROM services WHERE is_active ORDER BY unit_price`,
    );
    res.set('Cache-Control', 'public, max-age=300').json(rows);
  }),
);

// Céges elérhetőségek a Kapcsolat oldalhoz – a .env-ből, így kódmódosítás nélkül cserélhető
publicRouter.get('/contact', (req, res) => {
  const { email, phone, address } = config.company;
  res.set('Cache-Control', 'public, max-age=300').json({
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    phone: phone || null,
    address: address || null,
  });
});

// ─── Belső végpontok (portál) ──────────────────────────────────────────────
const router = Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });

router.get(
  '/',
  validate({ query: z.object({ status: z.enum(['new', 'contacted', 'converted', 'closed']).optional() }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT i.*, c.name AS client_name FROM inquiries i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE ($1::text IS NULL OR i.status = $1)
       ORDER BY (i.status = 'new') DESC, i.created_at DESC`,
      [req.valid.query.status ?? null],
    );
    res.json(rows);
  }),
);

router.patch(
  '/:id',
  validate({ params: idParam, body: z.object({ status: z.enum(['new', 'contacted', 'closed']) }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE inquiries SET status=$2, updated_at=now() WHERE id=$1 AND status <> 'converted' RETURNING *`,
      [req.valid.params.id, req.valid.body.status],
    );
    if (!rows[0]) throw new HttpError(409, 'Nem található, vagy már ügyféllé lett alakítva');
    await audit(req, 'status_change', 'inquiry', rows[0].id, { to: req.valid.body.status });
    res.json(rows[0]);
  }),
);

// Érdeklődőből ügyfél: egy tranzakcióban létrehozza az ügyfelet és összeköti
router.post(
  '/:id/convert',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const client = await withTransaction(async (db) => {
      const { rows } = await db.query('SELECT * FROM inquiries WHERE id=$1 FOR UPDATE', [req.valid.params.id]);
      const inq = rows[0];
      if (!inq) throw new HttpError(404, 'Érdeklődés nem található');
      if (inq.status === 'converted') throw new HttpError(409, 'Már ügyféllé lett alakítva');
      const c = await db.query(
        `INSERT INTO clients (name, client_type, email, phone, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name`,
        [inq.company || inq.name, inq.company ? 'company' : 'individual', inq.email, inq.phone,
          `Kapcsolattartó: ${inq.name}\nWeboldalról érkezett (${inq.created_at.toISOString().slice(0, 10)}):\n${inq.message}`,
          req.user.id],
      );
      await db.query(
        `UPDATE inquiries SET status='converted', client_id=$2, updated_at=now() WHERE id=$1`,
        [inq.id, c.rows[0].id],
      );
      await audit(req, 'convert', 'inquiry', inq.id, { client_id: c.rows[0].id }, db);
      return c.rows[0];
    });
    res.status(201).json(client);
  }),
);

export default router;
