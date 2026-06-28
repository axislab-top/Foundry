-- Skills P1.4 marketplace tables
CREATE TABLE IF NOT EXISTS marketplace_skill_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(120) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  description text NULL,
  source_skill_id uuid NOT NULL,
  source_revision_id uuid NULL,
  version_label varchar(32) NULL,
  governance_snapshot jsonb NULL,
  handler_config_snapshot jsonb NULL,
  mcp_tools_snapshot jsonb NULL,
  pricing_model varchar(32) NOT NULL DEFAULT 'free',
  price_cents int NOT NULL DEFAULT 0,
  subscription_interval varchar(32) NULL,
  is_published boolean NOT NULL DEFAULT false,
  usage_count int NOT NULL DEFAULT 0,
  metadata jsonb NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_skill_packages_published
  ON marketplace_skill_packages (is_published);

CREATE TABLE IF NOT EXISTS marketplace_skill_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  marketplace_skill_package_id uuid NOT NULL,
  purchased_skill_id uuid NULL,
  price_cents int NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'active',
  started_on date NOT NULL,
  last_billed_on date NULL,
  ended_on date NULL,
  metadata jsonb NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_skill_subscriptions_company_status
  ON marketplace_skill_subscriptions (company_id, status);
