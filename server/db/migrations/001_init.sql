-- 001_init.sql – alap séma
-- Pénzösszegek: NUMERIC(14,2) – nincs lebegőpontos kerekítési hiba.

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(200) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'consultant'
                CHECK (role IN ('admin', 'consultant')),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  failed_logins INTEGER      NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  client_type    VARCHAR(20)  NOT NULL DEFAULT 'company'
                 CHECK (client_type IN ('company', 'individual')),
  -- Adószám: alkalmazásszinten AES-256-GCM-mel titkosítva tárolódik
  tax_number_enc TEXT,
  email          VARCHAR(255),
  phone          VARCHAR(50),
  address        TEXT,
  notes          TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_name ON clients (lower(name));

-- Szolgáltatás-katalógus (árajánlat tételeinek forrása)
CREATE TABLE services (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200)  NOT NULL,
  description TEXT,
  unit        VARCHAR(30)   NOT NULL DEFAULT 'óra',
  unit_price  NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  vat_rate    NUMERIC(5,2)  NOT NULL DEFAULT 27 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Évente újrainduló árajánlat-sorszám (AJ-2026-0001)
CREATE TABLE quote_counters (
  year     INTEGER PRIMARY KEY,
  last_num INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE quotes (
  id           SERIAL PRIMARY KEY,
  quote_number VARCHAR(30)   NOT NULL UNIQUE,
  client_id    INTEGER       NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  status       VARCHAR(20)   NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  issue_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  valid_until  DATE          NOT NULL,
  currency     CHAR(3)       NOT NULL DEFAULT 'HUF',
  notes        TEXT,
  net_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_total  NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (valid_until >= issue_date)
);
CREATE INDEX idx_quotes_client ON quotes (client_id);
CREATE INDEX idx_quotes_status ON quotes (status);

CREATE TABLE quote_items (
  id           SERIAL PRIMARY KEY,
  quote_id     INTEGER       NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  service_id   INTEGER       REFERENCES services(id) ON DELETE SET NULL,
  position     INTEGER       NOT NULL,
  description  VARCHAR(500)  NOT NULL,
  quantity     NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit         VARCHAR(30)   NOT NULL,
  unit_price   NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  discount_pct NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  vat_rate     NUMERIC(5,2)  NOT NULL CHECK (vat_rate >= 0 AND vat_rate <= 100),
  line_net     NUMERIC(14,2) NOT NULL,
  line_vat     NUMERIC(14,2) NOT NULL,
  line_gross   NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_quote_items_quote ON quote_items (quote_id);

CREATE TABLE expense_categories (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE expenses (
  id           SERIAL PRIMARY KEY,
  category_id  INTEGER       NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  client_id    INTEGER       REFERENCES clients(id) ON DELETE SET NULL, -- továbbszámlázható költség
  description  VARCHAR(500)  NOT NULL,
  supplier     VARCHAR(200),
  expense_date DATE          NOT NULL,
  amount_net   NUMERIC(14,2) NOT NULL CHECK (amount_net >= 0),
  vat_rate     NUMERIC(5,2)  NOT NULL DEFAULT 27,
  amount_vat   NUMERIC(14,2) NOT NULL,
  amount_gross NUMERIC(14,2) NOT NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_date ON expenses (expense_date);

-- Audit napló: ki, mikor, mit módosított (biztonsági audithoz)
CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50)  NOT NULL,
  entity     VARCHAR(50)  NOT NULL,
  entity_id  INTEGER,
  ip         VARCHAR(64),
  meta       JSONB,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log (entity, entity_id);
