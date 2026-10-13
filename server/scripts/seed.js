// Kezdeti adatok: admin felhasználó, szolgáltatás-katalógus, költségkategóriák.
// Az admin jelszó a SEED_ADMIN_PASSWORD env változóból jön – soha nincs a kódban.
import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';

const services = [
  ['Pénzügyi tanácsadás (óradíj)', 'Egyedi pénzügyi tanácsadás szakértővel', 'óra', 25000, 27],
  ['Adótanácsadás (óradíj)', 'Adózási kérdések, adóoptimalizálás', 'óra', 30000, 27],
  ['Üzleti terv készítése', 'Pénzügyi előrejelzéssel, cash-flow tervvel', 'alkalom', 350000, 27],
  ['Pályázati pénzügyi terv', 'Pályázat pénzügyi mellékleteinek elkészítése', 'alkalom', 180000, 27],
  ['Havi pénzügyi controlling', 'Havi riport, likviditásfigyelés', 'hó', 120000, 27],
  ['Hitelkérelem előkészítése', 'Banki dokumentáció összeállítása', 'alkalom', 150000, 27],
];

const categories = ['Iroda és rezsi', 'Szoftver és előfizetés', 'Utazás', 'Képzés', 'Marketing', 'Egyéb'];

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Állítsd be a SEED_ADMIN_PASSWORD változót (min. 12 karakter)');
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, 'Rendszergazda', 'admin')
     ON CONFLICT (email) DO NOTHING`,
    [email.toLowerCase(), hash],
  );

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM services');
  if (rows[0].n === 0) {
    for (const s of services) {
      await pool.query(
        'INSERT INTO services (name, description, unit, unit_price, vat_rate) VALUES ($1,$2,$3,$4,$5)',
        s,
      );
    }
  }
  for (const c of categories) {
    await pool.query('INSERT INTO expense_categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [c]);
  }
  console.log(`Seed kész. Admin: ${email}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
