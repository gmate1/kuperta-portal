# FinPortál

Belső ügyviteli webalkalmazás pénzügyi tanácsadó cég számára: ügyfélkezelés,
szolgáltatás-katalógus, automatizált árajánlat-készítés és költségkövetés.

**Stack:** React (Vite) · Node.js / Express · PostgreSQL · Docker · nginx

## Architektúra

```
Böngésző ──HTTPS──▶ [reverse proxy: Caddy] ──▶ [web: nginx]
                                                 ├── /        → React SPA (statikus)
                                                 └── /api/*   → [api: Express] ──▶ [db: PostgreSQL]
```

- A frontend és az API **azonos originről** szolgálódik ki → a JWT `httpOnly; SameSite=Strict`
  sütiben utazhat, nincs szükség CORS-ra és localStorage-ban tárolt tokenre.
- Az adatbázis portja nincs kiengedve, csak a Docker belső hálózatán érhető el.

## Mappaszerkezet

```
server/
  db/migrations/   SQL migrációk (verziózott séma)
  scripts/         migrate.js, seed.js
  src/
    routes/        auth, clients, services, quotes, expenses, dashboard
    middleware/    auth, validáció, hibakezelés
    utils/         money.js (fillér-pontos számítás), crypto.js (AES-256-GCM), audit.js
  tests/           unit tesztek (node:test)
client/
  src/pages/       Login, Dashboard, Clients, Quotes, QuoteEditor, Expenses
```

## Lokális fejlesztés

Kell: Node 20+, PostgreSQL 14+ (vagy `docker run -p 5432:5432 -e POSTGRES_USER=finportal -e POSTGRES_PASSWORD=finportal postgres:16-alpine`).

```bash
cd server
cp .env.example .env        # töltsd ki: openssl rand -hex 32 a kulcsokhoz
npm install
npm run migrate
npm run seed                # admin felhasználó + szolgáltatás-katalógus
npm run dev                 # http://localhost:4000

cd ../client
npm install
npm run dev                 # http://localhost:5173 (a /api a 4000-re proxyzódik)
```

Tesztek: `cd server && npm test`

## Éles telepítés (VPS)

Ajánlott: egy kis VPS (pl. Hetzner CX22, ~5 €/hó, 2 vCPU / 4 GB RAM) Ubuntu 24.04-gyel.

1. **DNS:** a domain `A` rekordja mutasson a VPS IP-címére (pl. `portal.domain.hu`).
2. **Szerver:** Docker telepítése, tűzfal: csak 22, 80, 443 nyitva (`ufw`).
3. **Alkalmazás:**
   ```bash
   git clone <repo> finportal && cd finportal
   cp .env.example .env          # töltsd ki, PUBLIC_URL=https://portal.domain.hu, COOKIE_SECURE=true
   docker compose up -d --build
   docker compose exec api node scripts/seed.js
   ```
4. **HTTPS (Caddy, automatikus Let's Encrypt tanúsítvány)** – `/etc/caddy/Caddyfile`:
   ```
   portal.domain.hu {
       reverse_proxy localhost:8080
       header Strict-Transport-Security "max-age=31536000; includeSubDomains"
   }
   ```
   Ekkor a `WEB_PORT`-ot érdemes `127.0.0.1:8080`-ra kötni, hogy csak a Caddy érje el.
5. **Mentés:** napi `pg_dump` cron (`docker compose exec db pg_dump -U finportal finportal | gzip > backup.sql.gz`).

## API áttekintés

| Módszer | Végpont | Leírás |
|---|---|---|
| POST | `/api/auth/login` | Bejelentkezés (süti) |
| POST | `/api/auth/logout` | Kijelentkezés |
| GET | `/api/auth/me` | Aktuális felhasználó |
| POST | `/api/auth/users` | Új munkatárs (admin) |
| GET/POST | `/api/clients` | Ügyfelek listája (`?q=` keresés) / létrehozás |
| GET/PUT/DELETE | `/api/clients/:id` | Részletek (teljes adószám, naplózva) / módosítás / törlés (admin) |
| GET/POST/PUT | `/api/services` | Szolgáltatás-katalógus (írás: admin) |
| GET/POST | `/api/quotes` | Árajánlatok (`?status=`, `?client_id=`) / létrehozás |
| GET/PUT/DELETE | `/api/quotes/:id` | Részletek / szerkesztés és törlés (csak piszkozat) |
| PATCH | `/api/quotes/:id/status` | Státuszváltás (állapotgép szerint) |
| POST | `/api/quotes/:id/duplicate` | Ajánlat másolása új sorszámmal |
| GET/POST | `/api/expenses` | Költségek (`?from=&to=&category_id=`) / rögzítés |
| GET | `/api/expenses/summary` | Összesítés kategóriánként és havonta |
| GET | `/api/dashboard` | Áttekintő számok |

### Árajánlat státuszok

```
draft ──▶ sent ──▶ accepted
  ▲        ├─────▶ rejected ──┐
  │        └─────▶ expired  ──┤
  └───────────────────────────┘
```
Csak `draft` állapotban szerkeszthető / törölhető. Az összegeket mindig a szerver számolja.

## Biztonsági megoldások (a dokumentáció IT-biztonsági fejezetéhez)

| Fenyegetés | Védekezés |
|---|---|
| SQL injection | Kizárólag paraméterezett lekérdezések (`$1, $2…`) |
| XSS | React automatikus escape; JWT `httpOnly` sütiben (JS-ből nem lopható); CSP fejléc |
| CSRF | `SameSite=Strict` süti, azonos origin |
| Brute force | IP alapú rate limit + fiókzárolás 5 hibás próbálkozás után 15 percre |
| Felhasználó-felderítés | Nem létező emailnél is lefut egy bcrypt összehasonlítás (azonos válaszidő) |
| Jelszólopás DB-ből | bcrypt (cost 12); erős jelszó szabály |
| Érzékeny adat kiszivárgása | Adószám AES-256-GCM-mel titkosítva tárolva; listában maszkolva; megtekintés naplózva |
| Hibás / rosszindulatú bemenet | Zod séma validáció minden végponton; DB `CHECK` megszorítások |
| Számítási manipuláció | Az összegeket a szerver számolja, fillér-pontos egész aritmetikával |
| Jogosultság | Szerepkörök (`admin`, `consultant`); érzékeny műveletek csak adminnak |
| Lehallgatás | HTTPS (Caddy + Let's Encrypt), HSTS, `Secure` süti |
| Utólagos elszámoltathatóság | `audit_log` tábla: belépés, módosítás, törlés, érzékeny adat megtekintése |
| DoS | Payload méretkorlát (200 kB), rate limit |
| Konténer kitörés | API nem root felhasználóként fut; DB nincs kiengedve |

## Következő lépések

- [ ] PDF árajánlat generálás és küldés emailben
- [ ] Ügyfélportál (az ügyfél online elfogadhatja az ajánlatot)
- [ ] Integráció: számlázó API (pl. Számlázz.hu / Billingo) – elfogadott ajánlatból számla
- [ ] MNB árfolyam API (EUR alapú ajánlatokhoz)
- [ ] Szolgáltatás-katalógus admin felület
- [ ] E2E tesztek (Playwright), CI (GitHub Actions)
