import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Hiányzó környezeti változó: ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  // 32 bájtos kulcs hex formában (64 karakter): openssl rand -hex 32
  encryptionKey: required('DATA_ENCRYPTION_KEY'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // 'auto': Secure süti, ha a kérés HTTPS-en jött (X-Forwarded-Proto), egyébként nem.
  // Így a tunnelen (HTTPS) és helyben (http://portal.localhost) is működik.
  cookieSecure: process.env.COOKIE_SECURE || 'auto',
};

if (config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET legalább 32 karakter legyen');
}
if (!/^[0-9a-f]{64}$/i.test(config.encryptionKey)) {
  throw new Error('DATA_ENCRYPTION_KEY 64 hex karakter legyen (openssl rand -hex 32)');
}
