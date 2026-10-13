// Bemutató adatok: kitalált ügyfelek, árajánlatok vegyes státuszban, költségek,
// érdeklődések. Csak üres adatbázison fut (ha már van ügyfél, nem csinál semmit).
// Futtatás előtt: npm run migrate && npm run seed
import { pool, withTransaction } from '../src/db.js';
import { encrypt } from '../src/utils/crypto.js';
import { calcTotals, calcExpense } from '../src/utils/money.js';

const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

const clients = [
  ['Duna-Ipoly Gépszerviz Kft.', 'company', '24816357-2-13', 'iroda@dunaipolygep.example', '+36 30 123 4567', '2600 Vác, Ipari park 4.'],
  ['Mezőfalvi Pékség Bt.', 'company', '21345678-1-07', 'pekseg@mezofalvi.example', '+36 25 555 120', '2422 Mezőfalva, Fő utca 12.'],
  ['Kovács Andrea e.v.', 'individual', '8412345670', 'kovacs.andrea@example.com', '+36 70 222 3344', '1134 Budapest, Lehel utca 8.'],
  ['Bükki Vendégház Kft.', 'company', '25987412-2-05', 'foglalas@bukkivendeghaz.example', '+36 46 444 210', '3517 Miskolc, Erdő sor 3.'],
  ['Tiszta Ablak Szolgáltató Kft.', 'company', '26654321-2-42', 'info@tisztaablak.example', '+36 20 987 6543', '1097 Budapest, Gubacsi út 21.'],
  ['Szabó és Fia Asztalosipari Kft.', 'company', '23456789-2-09', 'szabo.asztalos@example.com', '+36 52 333 901', '4031 Debrecen, Határ út 66.'],
  ['Novák Péter', 'individual', '8398765432', 'novak.peter@example.com', '+36 30 765 4321', '2030 Érd, Tó utca 5.'],
  ['ZöldKert Webáruház Kft.', 'company', '27123456-2-13', 'hello@zoldkert.example', '+36 1 400 5500', '2040 Budaörs, Kinizsi út 2.'],
  ['Balaton-Part Hajójavító Zrt.', 'company', '12987654-2-19', 'titkarsag@bphajo.example', '+36 87 512 300', '8230 Balatonfüred, Kikötő 1.'],
  ['Révész Fogászat Kft.', 'company', '24433221-1-41', 'rendelo@reveszfog.example', '+36 1 789 0123', '1052 Budapest, Petőfi tér 2.'],
];

// [ügyfél index, kiállítás (nap a mai naphoz képest), státusz, tételek: [szolgáltatás index, mennyiség, kedvezmény%]]
const quotes = [
  [0, -110, 'accepted', [[4, 6, 0], [0, 4, 0]]],
  [1, -95, 'accepted', [[2, 1, 10]]],
  [2, -88, 'rejected', [[1, 5, 0]]],
  [3, -80, 'accepted', [[3, 1, 0], [0, 3, 0]]],
  [4, -70, 'expired', [[5, 1, 0]]],
  [5, -62, 'accepted', [[2, 1, 0], [4, 3, 0]]],
  [6, -55, 'accepted', [[1, 3, 0]]],
  [7, -41, 'sent', [[4, 12, 15]]],
  [8, -35, 'accepted', [[5, 1, 0], [0, 6, 0]]],
  [9, -28, 'sent', [[1, 8, 0]]],
  [0, -20, 'accepted', [[3, 1, 0]]],
  [3, -14, 'sent', [[0, 10, 5]]],
  [5, -9, 'sent', [[5, 1, 0], [1, 2, 0]]],
  [7, -5, 'draft', [[2, 1, 0]]],
  [8, -2, 'draft', [[4, 6, 0]]],
  [1, -1, 'draft', [[0, 2, 0]]],
];

// [kategória név, leírás, szállító, nap, nettó, ÁFA]
const expenses = [];
const monthly = [
  ['Iroda és rezsi', 'Irodabérlet', 'Andrássy Irodaház Kft.', 180000, 27],
  ['Szoftver és előfizetés', 'Könyvelő- és számlázó szoftver', 'Szoftver előfizetés', 14900, 27],
  ['Szoftver és előfizetés', 'Irodai programcsomag (5 fő)', 'Szoftver előfizetés', 22500, 27],
  ['Iroda és rezsi', 'Internet és mobil', 'Távközlési szolgáltató', 31000, 27],
];
for (let m = 0; m < 4; m++) {
  for (const [cat, desc, sup, net, vat] of monthly) expenses.push([cat, desc, sup, -m * 30 - 3, net, vat]);
}
expenses.push(
  ['Utazás', 'Ügyfélmegbeszélés, Miskolc – üzemanyag', 'Benzinkút', -79, 18400, 27, 3],
  ['Utazás', 'Vonatjegy, Debrecen', 'MÁV-Start', -61, 9840, 27, 5],
  ['Képzés', 'Adóváltozások 2027 – szakmai nap', 'Szakmai továbbképző', -45, 89000, 27],
  ['Marketing', 'Weboldal domain és tárhely', 'Rackhost', -40, 12000, 27],
  ['Marketing', 'Szakmai névjegykártyák', 'Nyomda', -33, 24500, 27],
  ['Utazás', 'Ügyfélmegbeszélés, Balatonfüred – üzemanyag', 'Benzinkút', -34, 15200, 27, 8],
  ['Egyéb', 'Irodaszerek', 'Irodaszer bolt', -18, 16300, 27],
  ['Képzés', 'Szakkönyv: vállalati pénzügyek', 'Könyvesbolt', -7, 8900, 5],
);

const inquiries = [
  ['Horváth Gábor', 'Horváth Szerkezetépítő Kft.', 'gabor@horvathszerk.example', '+36 30 456 7890', 'cashflow',
    'Tavaly óta nőtt a forgalmunk, mégis minden hónap végén szűkösen állunk. A vevők 60 napra fizetnek, mi a beszállítóknak 15 napra. Szeretnénk átlátni, hogyan lehetne ezt kezelni.', 0, 'new'],
  ['Farkas Eszter', null, 'farkas.eszter@example.com', null, 'business_plan',
    'Kávézót szeretnék nyitni Szentendrén, és a bankhoz üzleti terv kell. Mennyi idő alatt készül el, és mire van szükségük tőlem?', -1, 'new'],
  ['Molnár Tamás', 'Molnár Agrár Bt.', 'molnar.agrar@example.com', '+36 20 111 2233', 'grant',
    'Gépbeszerzésre pályáznánk, a kiírás november végén zárul. Tudnak segíteni a pénzügyi mellékletekben?', -3, 'contacted'],
  ['Kiss Réka', 'Kiss Design Kft.', 'reka@kissdesign.example', null, 'tax',
    'KATA után átálltunk, de nem vagyok biztos benne, hogy jó adózási formát választottunk. Egy egyórás konzultáció érdekelne.', -12, 'closed'],
];

async function main() {
  const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM clients');
  if (n > 0) {
    console.log('Már vannak ügyfelek az adatbázisban – a demó adatok kimaradnak.');
    return pool.end();
  }
  const { rows: [admin] } = await pool.query(`SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1`);
  if (!admin) throw new Error('Előbb futtasd: npm run seed');
  const { rows: services } = await pool.query('SELECT * FROM services ORDER BY id');
  const { rows: cats } = await pool.query('SELECT * FROM expense_categories');
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  await withTransaction(async (db) => {
    const clientIds = [];
    for (const [name, type, tax, email, phone, address] of clients) {
      const { rows } = await db.query(
        `INSERT INTO clients (name, client_type, tax_number_enc, email, phone, address, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now() - interval '120 days' * random()) RETURNING id`,
        [name, type, encrypt(tax), email, phone, address, admin.id],
      );
      clientIds.push(rows[0].id);
    }

    for (const [ci, offset, status, lines] of quotes) {
      const items = lines.map(([si, qty, disc]) => {
        const s = services[si];
        return { service_id: s.id, description: s.name, quantity: qty, unit: s.unit,
          unit_price: s.unit_price, discount_pct: disc, vat_rate: s.vat_rate };
      });
      const t = calcTotals(items);
      const issue = day(offset);
      const year = Number(issue.slice(0, 4));
      const { rows: [{ last_num }] } = await db.query(
        `INSERT INTO quote_counters (year, last_num) VALUES ($1, 1)
         ON CONFLICT (year) DO UPDATE SET last_num = quote_counters.last_num + 1 RETURNING last_num`,
        [year],
      );
      const { rows: [q] } = await db.query(
        `INSERT INTO quotes (quote_number, client_id, status, issue_date, valid_until, net_total, vat_total,
           gross_total, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date + time '10:00',$10::date + time '10:00' + interval '3 days')
         RETURNING id`,
        [`AJ-${year}-${String(last_num).padStart(4, '0')}`, clientIds[ci], status, issue, day(offset + 30),
          t.net_total, t.vat_total, t.gross_total, admin.id, issue],
      );
      for (const [i, l] of t.lines.entries()) {
        await db.query(
          `INSERT INTO quote_items (quote_id, service_id, position, description, quantity, unit, unit_price,
             discount_pct, vat_rate, line_net, line_vat, line_gross)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [q.id, l.service_id, i + 1, l.description, l.quantity, l.unit, l.unit_price, l.discount_pct,
            l.vat_rate, l.line_net, l.line_vat, l.line_gross],
        );
      }
    }

    for (const [cat, desc, sup, offset, net, vat, ci] of expenses) {
      const { amount_vat, amount_gross } = calcExpense(net, vat);
      await db.query(
        `INSERT INTO expenses (category_id, client_id, description, supplier, expense_date, amount_net,
           vat_rate, amount_vat, amount_gross, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [catId[cat], ci === undefined ? null : clientIds[ci], desc, sup, day(offset), net, vat,
          amount_vat, amount_gross, admin.id],
      );
    }

    for (const [name, company, email, phone, topic, message, offset, status] of inquiries) {
      await db.query(
        `INSERT INTO inquiries (name, company, email, phone, topic, message, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' days')::interval - interval '2 hours')`,
        [name, company, email, phone, topic, message, status, String(offset)],
      );
    }
  });

  console.log(`Demó adatok betöltve: ${clients.length} ügyfél, ${quotes.length} ajánlat, ${expenses.length} költség, ${inquiries.length} érdeklődés.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
