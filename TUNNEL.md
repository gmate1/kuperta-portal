# Futtatás a saját gépről, kuperta.hu-n (Windows + Cloudflare Tunnel)

A rendszer a saját gépeden fut Dockerben. A Cloudflare Tunnel egy **kimenő** kapcsolatot nyit
a Cloudflare felé, így:

- nem kell portot nyitni a routeren, és CGNAT mögött is működik,
- a HTTPS tanúsítványt a Cloudflare adja, ingyen,
- a géped IP-címe nem látszik kívülről,
- amíg a gép és a Docker fut, az oldal elérhető. Ha leállítod, eltűnik.

```
Látogató ──HTTPS──▶ Cloudflare ◀══ tunnel (kimenő) ══ cloudflared ─▶ nginx ─┬─ kuperta.hu        → weboldal
                                                       (a gépeden, Dockerben)  └─ portal.kuperta.hu → portál + API
```

> A Cloudflare felülete időnként átrendeződik. Ha egy menüpontot nem találsz pontosan ezen
> a néven, a keresőjében rákereshetsz (pl. „Tunnels”).

## 1. Egyszeri előkészítés a gépen

1. **Docker Desktop** telepítése (WSL2 háttérrel): https://www.docker.com/products/docker-desktop/
   Beállításokban: *General → Start Docker Desktop when you sign in* legyen bekapcsolva.
2. **Alvás kikapcsolása**, amíg az oldalnak futnia kell: *Gépház → Rendszer → Energiagazdálkodás →
   Képernyő és alvó állapot → Alvó állapot: Soha* (laptopnál töltőn és nyitott fedéllel, vagy
   *Vezérlőpult → Energiagazdálkodási lehetőségek → A fedél lecsukásakor: Nincs teendő*).

## 2. A domain átvitele a Cloudflare-re (egyszer, a bemutató előtt legalább 1 nappal)

1. Regisztrálj ingyenes fiókot: https://dash.cloudflare.com
2. *Add a domain* → `kuperta.hu` → **Free** csomag.
3. A Cloudflare beolvassa a meglévő DNS rekordokat. **Ha a Rackhostnál emailt is használsz**
   (pl. info@kuperta.hu), ellenőrizd, hogy az `MX` és a hozzá tartozó `TXT` rekordok átjöttek,
   különben nem érkezik meg a levél.
4. A Cloudflare mutat két névszervert (pl. `xxx.ns.cloudflare.com`).
5. **Rackhost ügyfélfelület → Domainek → kuperta.hu → Névszerverek**: írd át a kettőt a Cloudflare-éire.
   `.hu` domainnél ez pár órát is igénybe vehet.
6. Várd meg, amíg a Cloudflare-en a domain állapota **Active** lesz (emailt is küldenek).
7. *SSL/TLS → Edge Certificates*: kapcsold be az **Always Use HTTPS**-t.

## 3. A tunnel létrehozása

1. Cloudflare → **Zero Trust** → *Networks → Tunnels* → **Create a tunnel** → *Cloudflared*.
2. Név: `kuperta`.
3. A telepítési lépésnél válaszd a **Docker** fület. Megjelenik egy parancs, benne egy hosszú
   `--token eyJ...` rész. **Csak a tokent másold ki** (az `eyJ...` kezdetű szöveget) – a parancsot
   nem kell lefuttatni, a cloudflared a compose-ban már benne van.
4. **Public Hostnames / Published application routes** – vegyél fel hármat, mindegyik ugyanoda mutat:

   | Subdomain | Domain | Service |
   |---|---|---|
   | *(üres)* | kuperta.hu | `HTTP` → `web:80` |
   | `www` | kuperta.hu | `HTTP` → `web:80` |
   | `portal` | kuperta.hu | `HTTP` → `web:80` |

   A `web` a Docker konténer neve – az nginx a domain alapján dönti el, hogy a weboldalt vagy a portált adja.

## 4. Indítás

PowerShellben, a projekt mappájában:

```powershell
copy .env.example .env
notepad .env
```

Töltsd ki (kulcsgenerálás PowerShellben, kétszer futtasd, két külön kulcsot kapsz):

```powershell
-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })
```

- `POSTGRES_PASSWORD` – bármilyen hosszú jelszó
- `JWT_SECRET` és `DATA_ENCRYPTION_KEY` – a fenti paranccsal generált két érték
- `SEED_ADMIN_PASSWORD` – az első belépéshez (min. 12 karakter, kis- és nagybetű, szám)
- `TUNNEL_TOKEN` – a 3. lépésben kimásolt token

Majd:

```powershell
docker compose --profile tunnel up -d --build
docker compose exec api node scripts/seed.js        # admin felhasználó + szolgáltatások
docker compose exec api node scripts/seed-demo.js   # bemutató adatok (opcionális)
```

Ellenőrzés: a Cloudflare-en a tunnel állapota **Healthy**, és megnyílik:

- https://kuperta.hu – weboldal
- https://portal.kuperta.hu – portál (belépés a `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` párossal)

## Napi használat

| Mit | Parancs |
|---|---|
| Minden indítása tunnellel | `docker compose --profile tunnel up -d` |
| Csak helyben (internet felé nem látszik) | `docker compose up -d` → http://localhost:8080 és http://portal.localhost:8080 |
| Oldal levétele a netről, helyben marad | `docker compose stop tunnel` |
| Minden leállítása (az adatok megmaradnak) | `docker compose --profile tunnel down` |
| Naplók | `docker compose logs -f api` |
| Mentés | `docker compose exec db pg_dump -U finportal finportal > mentes.sql` |

A konténerek `restart: unless-stopped` beállítással futnak: ha a gép újraindul, a Docker Desktop
indulásakor maguktól visszajönnek, a tunnel is.

## Opcionális: plusz védelem a portálra (Cloudflare Access)

*Zero Trust → Access → Applications → Add an application → Self-hosted*, domain: `portal.kuperta.hu`,
szabály: csak a megadott email címek. Ekkor a portál bejelentkező oldala elé a Cloudflare egy
emailes egyszer használatos kódot tesz – a nyilvános weboldal érintetlen marad. Ez kétfaktoros
védelem kódírás nélkül, és jól mutat a biztonsági fejezetben.

## Hibaelhárítás

- **A tunnel nem Healthy:** `docker compose logs tunnel` – leggyakrabban rosszul másolt token.
- **502 / Bad gateway a Cloudflare-től:** a Public Hostnames-nél a Service pontosan `http://web:80` legyen.
- **Bejelentkezés után azonnal kidob:** böngészőben töröld a portal.kuperta.hu sütijeit.
- **A domain nem Active:** a névszerver-csere `.hu` domainnél akár fél napig is tarthat.
