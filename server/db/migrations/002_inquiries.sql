-- 002_inquiries.sql – a nyilvános weboldal kapcsolatfelvételi űrlapjáról érkező érdeklődések

CREATE TABLE inquiries (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  company    VARCHAR(200),
  email      VARCHAR(255) NOT NULL,
  phone      VARCHAR(50),
  topic      VARCHAR(30)  NOT NULL
             CHECK (topic IN ('cashflow', 'tax', 'business_plan', 'grant', 'loan', 'other')),
  message    TEXT         NOT NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'new'
             CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
  client_id  INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  ip         VARCHAR(64),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_inquiries_status ON inquiries (status, created_at DESC);
