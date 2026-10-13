import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { config } from '../config.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Express 4 nem kapja el az async hibákat – ez a wrapper továbbítja őket. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** JWT ellenőrzés httpOnly sütiből (JS-ből nem olvasható → XSS ellen véd). */
export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return next(new HttpError(401, 'Bejelentkezés szükséges'));
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    next(new HttpError(401, 'Érvénytelen vagy lejárt munkamenet'));
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'Nincs jogosultság'));

/** Zod séma alapú validáció: body / query / params. A validált adat felülírja az eredetit. */
export const validate = (schemas) => (req, res, next) => {
  try {
    for (const key of ['body', 'query', 'params']) {
      if (schemas[key]) req.valid = { ...req.valid, [key]: schemas[key].parse(req[key]) };
    }
    next();
  } catch (err) {
    next(err);
  }
};

export function notFound(req, res) {
  res.status(404).json({ error: 'Nem található' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Hibás adatok',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err.status) return res.status(err.status).json({ error: err.message });
  // PostgreSQL hibakódok
  if (err.code === '23505') return res.status(409).json({ error: 'Már létező rekord' });
  if (err.code === '23503') return res.status(409).json({ error: 'Hivatkozott rekord miatt nem végrehajtható' });

  console.error(err);
  // Élesben nem szivárogtatunk belső részleteket
  res.status(500).json({ error: 'Szerverhiba' });
}
