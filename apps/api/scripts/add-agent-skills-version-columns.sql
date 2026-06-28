-- Skills P1.3: version lock fields for agent skill binding
ALTER TABLE agent_skills
  ADD COLUMN IF NOT EXISTS version integer NULL,
  ADD COLUMN IF NOT EXISTS semver_version varchar(32) NULL;

CREATE INDEX IF NOT EXISTS idx_agent_skills_company_skill_version
  ON agent_skills (company_id, skill_id, version);
