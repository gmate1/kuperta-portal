import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { asyncHandler, validate, requireAuth, requireRole, HttpError } from '../middleware/index.js';
import { audit } from '../utils/audit.js';

const router = Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

// Brute force elleni védelem IP szinten (a fiókzárolás mellett)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Túl sok bejelentkezési kísérlet, próbáld később' },
});

const cookieOptions = (req) => ({
  httpOnly: true,
  secure: config.cookieSecure === 'auto' ? req.secure : config.cookieSecure === 'true',
  sameSite: 'strict', // CSRF ellen: más oldalról indított kérés nem viszi a sütit
  path: '/',
});

// Egy előre kiszámolt hash, hogy nem létező emailnél is ugyanannyi ideig tartson
// a válasz (időzítéses felhasználó-felderítés ellen).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

const loginSchema = z.object({
  email: z.string().email().max(255).transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(200),
});

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.valid.body;
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];

    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      throw new HttpError(423, 'A fiók átmenetileg zárolva, próbáld később');
    }

    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok || !user.is_active) {
      if (user) {
        const failed = user.failed_logins + 1;
        await query(
          `UPDATE users SET failed_logins = $2::int,
             locked_until = CASE WHEN $2::int >= $3::int
                            THEN now() + make_interval(mins => $4::int) ELSE NULL END
           WHERE id = $1`,
          [user.id, failed, MAX_FAILED, LOCK_MINUTES],
        );
      }
      await audit(req, 'login_failed', 'user', user?.id ?? null, { email });
      throw new HttpError(401, 'Hibás email vagy jelszó');
    }

    await query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
    const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
      algorithm: 'HS256',
    });
    res.cookie('token', token, { ...cookieOptions(req), maxAge: 8 * 60 * 60 * 1000 });
    req.user = { id: user.id };
    await audit(req, 'login', 'user', user.id);
    res.json({ id: user.id, email: user.email, full_name: user.full_name, role: user.role });
  }),
);

router.post('/logout', (req, res) => {
  res.clearCookie('token', cookieOptions(req));
  res.status(204).end();
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT id, email, full_name, role FROM users WHERE id = $1 AND is_active',
      [req.user.id],
    );
    if (!rows[0]) throw new HttpError(401, 'Felhasználó nem található');
    res.json(rows[0]);
  }),
);

// Új munkatárs felvétele – csak admin
const userSchema = z.object({
  email: z.string().email().max(255).transform((s) => s.toLowerCase()),
  full_name: z.string().trim().min(2).max(200),
  role: z.enum(['admin', 'consultant']).default('consultant'),
  // Erős jelszó: min. 12 karakter, kis- és nagybetű, szám
  password: z
    .string()
    .min(12, 'Legalább 12 karakter')
    .max(200)
    .regex(/[a-z]/, 'Kell kisbetű')
    .regex(/[A-Z]/, 'Kell nagybetű')
    .regex(/\d/, 'Kell szám'),
});

router.post(
  '/users',
  requireAuth,
  requireRole('admin'),
  validate({ body: userSchema }),
  asyncHandler(async (req, res) => {
    const { email, full_name, role, password } = req.valid.body;
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4) RETURNING id, email, full_name, role`,
      [email, hash, full_name, role],
    );
    await audit(req, 'create', 'user', rows[0].id, { email, role });
    res.status(201).json(rows[0]);
  }),
);

export default router;
