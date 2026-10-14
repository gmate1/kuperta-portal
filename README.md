# Kuperta – weboldal és belső portál

Pénzügyi tanácsadó cég nyilvános weboldala (**kuperta.hu**) és belső ügyviteli portálja
(**portal.kuperta.hu**): érdeklődők fogadása, ügyfélkezelés, szolgáltatás-katalógus,
automatizált árajánlat-készítés és költségkövetés.

**Stack:** React (Vite) · Node.js / Express · PostgreSQL · nginx · Docker · Cloudflare Tunnel

## Architektúra

```
Látogató ─HTTPS─▶ Cloudflare ◀═tunnel═ cloudflared ─▶ [web: nginx] ─┬─ kuperta.hu
                                                                   │    ├─ /                     → weboldal (statikus)
                                                                   │    └─ /api/public/*         → [api]
                                                                   └─ portal.kuperta.hu
                                                                        ├─ /                     → React SPA
                                                                        └─ /api/*                → [api: Express] ─▶ [db: PostgreSQL]
```

- **A nyilvános oldal felől csak három végpont érhető el** (űrlap beküldés, árlista, céges elérhetőségek); minden más `/api`
  hívás 404. A portál teljes API-ja csak a portal aldomainen át szólítható meg.
- A portál és az API **azonos originről** szolgálódik ki → a JWT `httpOnly; SameSite=Strict`
  sütiben utazik, nincs localStorage-ban tárolt token.
- A weboldal árlistája a portál szolgáltatás-katalógusából jön élőben; az űrlap beküldései a portál
  *Érdeklődések* oldalán jelennek meg, ahonnan egy kattintással ügyfél és árajánlat lesz belőlük.
- Az adatbázisnak és az API-nak nincs kifelé nyitott portja; a web is csak `127.0.0.1`-en figyel.

## Mappaszerkezet

```
server/
  db/migrations/   SQL migrációk (verziózott séma)
  scripts/         migrate.js, seed.js, seed-demo.js (bemutató adatok)
  src/
    routes/        auth, clients, services, quotes, expenses, inquiries, dashboard
    middleware/    auth, validáció, hibakezelés
    utils/         money.js (fillér-pontos számítás), crypto.js (AES-256-GCM), audit.js
  tests/           unit tesztek (node:test)
client/
  src/pages/       Login, Dashboard, Inquiries, Clients, Quotes, QuoteEditor, Expenses
site/              nyilvános weboldal: főoldal, kapcsolat, adatkezelés (HTML/CSS/JS, keretrendszer nélkül)
web/               nginx konfiguráció és a web konténer Dockerfile-ja
TUNNEL.md          futtatás a saját gépről, kuperta.hu-n
```

## Lokális fejlesztés

Kell: Node 20+, PostgreSQL 14+ (vagy `docker run -p 5432:5432 -e POSTGRES_USER=finportal -e POSTGRES_PASSWORD=finportal postgres:16-alpine`).

```bash
cd server
cp .env.example .env        # töltsd ki: openssl rand -hex 32 a kulcsokhoz
npm install
npm run migrate
npm run seed                # admin felhasználó + szolgáltatás-katalógus
npm run seed:demo           # bemutató adatok (opcionális)
npm run dev                 # http://localhost:4000

cd ../client
npm install
npm run dev                 # http://localhost:5173 (a /api a 4000-re proxyzódik)
```

A weboldal (`site/`) fejlesztéskor bármilyen statikus szerverrel nézhető; az űrlap és az élő árlista
a Docker-es futtatásban működik.

Tesztek: `cd server && npm test`

## Futtatás Dockerrel

```bash
cp .env.example .env               # töltsd ki
docker compose up -d --build
docker compose exec api node scripts/seed.js
docker compose exec api node scripts/seed-demo.js
```

- http://localhost:8080 – weboldal
- http://portal.localhost:8080 – portál

A kuperta.hu-n való elérés a saját gépről, Cloudflare Tunnellel: **[TUNNEL.md](TUNNEL.md)**.

## Alternatíva: VPS

Ha a rendszernek folyamatosan futnia kell, ugyanez a compose egy kis VPS-en is fut (pl. Rackhost VPS 2GB):
Docker telepítése, `ufw` tűzfal (csak 22/tcp), majd ugyanaz a `docker compose --profile tunnel up -d`.
A tunnel miatt a VPS-en sem kell 80/443 portot nyitni.

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
| GET | `/api/inquiries` | Weboldalról érkezett érdeklődések |
| PATCH | `/api/inquiries/:id` | Állapot (új / felvettük a kapcsolatot / lezárva) |
| POST | `/api/inquiries/:id/convert` | Érdeklődőből ügyfél (tranzakcióban) |
| POST | `/api/public/inquiries` | **Nyilvános:** kapcsolat űrlap (5 / óra / IP, honeypot) |
| GET | `/api/public/services` | **Nyilvános:** árlista a weboldalnak |
| GET | `/api/public/contact` | **Nyilvános:** céges email / telefon / cím a `.env`-ből |

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
| Felhasználó-felderítés | Nem létező emailnél is lefut egy bcrypt összehasonlítás (azonos válaszidő). *Ismert gyengeség:* a „fiók zárolva” üzenet elárulja, hogy az email létezik |
| Jelszólopás DB-ből | bcrypt (cost 12); erős jelszó szabály |
| Érzékeny adat kiszivárgása | Adószám AES-256-GCM-mel titkosítva tárolva; listában maszkolva; megtekintés naplózva |
| Hibás / rosszindulatú bemenet | Zod séma validáció minden végponton; DB `CHECK` megszorítások |
| Számítási manipuláció | Az összegeket a szerver számolja, fillér-pontos egész aritmetikával |
| Jogosultság | Szerepkörök (`admin`, `consultant`); érzékeny műveletek csak adminnak |
| Lehallgatás | HTTPS a Cloudflare-en, `Secure` süti HTTPS kérésnél (automatikusan) |
| Támadási felület | Nyilvános domainen csak 3 API végpont; nincs nyitott port a routeren (kimenő tunnel); a géped IP-je rejtve |
| Spam / bot az űrlapon | Honeypot mező, IP-nkénti rate limit, szerveroldali validáció, kötelező adatkezelési hozzájárulás |
| Kattintás-eltérítés, injektált script | Szigorú CSP (`script-src 'self'`, inline script nincs), `X-Frame-Options: DENY` |
| Valódi kliens IP proxy mögött | `CF-Connecting-IP` csak a belső Docker hálózatról elfogadva (nginx realip) |
| Utólagos elszámoltathatóság | `audit_log` tábla: belépés, módosítás, törlés, érzékeny adat megtekintése |
| DoS | Payload méretkorlát (200 kB), rate limit |
| Konténer kitörés | API nem root felhasználóként fut; DB nincs kiengedve |

## A weboldal funkciói

- **Likviditás-kalkulátor** (`#kalkulator`): csúszkákkal megadott számokból 12 hónapos egyenleg-szimuláció
  (a vevők és szállítók fizetési határidejével eltolt pénzmozgás), animált görbével, szöveges
  eredménnyel és „mi lenne, ha a vevők 30 nappal hamarabb fizetnének” összehasonlítással.
- **Árlista** a portál szolgáltatás-katalógusából, soronként „Ajánlatot kérek” linkkel – a Kapcsolat
  űrlap a témát előre kiválasztja (`?tema=`).
- **GYIK** lenyíló kérdésekkel, ragadós fejléc, a hero grafikonjának egyszeri kirajzolódása.
- Minden animáció kikapcsol, ha a látogató rendszerében a „kevesebb mozgás” be van állítva.

## Arculat és elérhetőségek

- A színek a cég logójából jönnek: világoskék `#6B9CD6`, sötétkék `#3173AD`, a feliratok feketéje, a sötét
  szekciókhoz mélykék `#142F4C`. A logó átlátszó változatai a `site/img/` mappában vannak
  (`logo.png` szlogennel, `logo-head.png` fejléchez, `-light` változat sötét háttérre).
- A **Kapcsolat** oldal (`site/kapcsolat.html`) az email címet, telefont és címet a `.env`
  `COMPANY_EMAIL`, `COMPANY_PHONE`, `COMPANY_ADDRESS` változóiból mutatja – kódot nem kell módosítani.
  Üresen hagyva a cég adatai jelennek meg (kuperta.kft@gmail.com, 2230 Gyömrő, Kossuth Ferenc utca 34/A); a cégadatok a láblécben
  és az adatkezelési tájékoztatóban statikusan szerepelnek.
  Módosítás után: `docker compose up -d api`.

## Adatvédelem

A weboldal űrlapja hozzájáruláshoz kötött, az adatkezelési tájékoztató a `site/adatvedelem.html`-ben
van, a Kuperta Kft. adataival kitöltve.

## Következő lépések

- [ ] PDF árajánlat generálás és küldés emailben
- [ ] Ügyfélportál (az ügyfél online elfogadhatja az ajánlatot)
- [ ] Integráció: számlázó API (pl. Számlázz.hu / Billingo) – elfogadott ajánlatból számla
- [ ] MNB árfolyam API (EUR alapú ajánlatokhoz)
- [ ] Szolgáltatás-katalógus admin felület
- [ ] E2E tesztek (Playwright), CI (GitHub Actions)
