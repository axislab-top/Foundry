-- Initialization script for PostgreSQL database
-- This script runs automatically when the container is first created
-- Note: When using Docker, the database is created automatically via POSTGRES_DB env var
-- This script assumes the database already exists

-- Create extensions
-- Note: \c command doesn't work in init scripts, extensions are created in the target database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS audit;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO postgres;
































