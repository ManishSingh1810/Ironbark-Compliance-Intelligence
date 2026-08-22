-- Initial schema for Ironbark Ridge compliance intelligence
-- Checkpoint 2: tables only — no seed data
-- PostgreSQL dialect (not T-SQL)
--
-- source_row: 1-based physical CSV line number (row 1 = header; first data row = 2).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE quality_action AS ENUM ('fixed', 'flagged', 'rejected');

CREATE TYPE ingestion_status AS ENUM ('running', 'completed', 'failed');

CREATE TYPE delivery_date_precision AS ENUM ('day', 'month');

CREATE TYPE ai_finding_type AS ENUM (
  'safety_category',
  'psychosocial_hazard',
  'severity_inconsistency'
);

-- Tracks each ingestion execution and which source files were processed.
CREATE TABLE ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status ingestion_status NOT NULL DEFAULT 'running',
  notes TEXT
);

CREATE TABLE ingestion_run_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs (id) ON DELETE CASCADE,
  source_filename TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  row_count INTEGER CHECK (row_count IS NULL OR row_count >= 0),
  UNIQUE (ingestion_run_id, source_filename)
);

CREATE INDEX idx_ingestion_run_files_run ON ingestion_run_files (ingestion_run_id);

-- Emission factors are versioned per ingestion run (not globally unique by activity).
CREATE TABLE emission_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs (id) ON DELETE RESTRICT,
  source_filename TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK (source_row >= 2),

  activity TEXT NOT NULL,
  scope SMALLINT NOT NULL CHECK (scope IN (1, 2)),
  unit TEXT NOT NULL,
  kg_co2e_per_unit NUMERIC(12, 6) NOT NULL CHECK (kg_co2e_per_unit >= 0),
  factor_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (ingestion_run_id, source_filename, source_row),
  UNIQUE (ingestion_run_id, activity)
);

CREATE INDEX idx_emission_factors_run ON emission_factors (ingestion_run_id);

-- One row per source CSV row; raw and normalised values stored together.
CREATE TABLE fuel_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs (id) ON DELETE RESTRICT,
  source_filename TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK (source_row >= 2),

  invoice_no_raw TEXT NOT NULL,
  delivery_date_raw TEXT NOT NULL,
  fuel_type_raw TEXT NOT NULL,
  quantity_raw TEXT NOT NULL,
  unit_raw TEXT NOT NULL,
  cost_aud_raw TEXT NOT NULL,
  site_area_raw TEXT NOT NULL,

  invoice_no TEXT,
  delivery_date DATE,
  reporting_month DATE,
  date_precision delivery_date_precision,
  fuel_type TEXT,
  quantity_litres NUMERIC(14, 3),
  cost_aud NUMERIC(14, 2),
  site_area TEXT,

  include_in_emissions BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (ingestion_run_id, source_filename, source_row)
);

CREATE INDEX idx_fuel_deliveries_run ON fuel_deliveries (ingestion_run_id);
CREATE INDEX idx_fuel_deliveries_reporting_month ON fuel_deliveries (reporting_month)
  WHERE include_in_emissions = TRUE;
CREATE INDEX idx_fuel_deliveries_delivery_date ON fuel_deliveries (delivery_date)
  WHERE include_in_emissions = TRUE;

CREATE TABLE electricity_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs (id) ON DELETE RESTRICT,
  source_filename TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK (source_row >= 2),

  meter_id_raw TEXT NOT NULL,
  meter_description_raw TEXT NOT NULL,
  period_raw TEXT NOT NULL,
  consumption_raw TEXT NOT NULL,
  unit_raw TEXT NOT NULL,

  meter_id TEXT NOT NULL,
  meter_description TEXT,
  period_month DATE NOT NULL,
  consumption_kwh NUMERIC(14, 3) NOT NULL,

  include_in_emissions BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (ingestion_run_id, source_filename, source_row)
);

CREATE INDEX idx_electricity_readings_run ON electricity_readings (ingestion_run_id);
CREATE INDEX idx_electricity_readings_period ON electricity_readings (period_month)
  WHERE include_in_emissions = TRUE;
CREATE INDEX idx_electricity_readings_meter_period ON electricity_readings (meter_id, period_month);

CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs (id) ON DELETE RESTRICT,
  source_filename TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK (source_row >= 2),

  source_incident_id TEXT NOT NULL,
  incident_date_raw TEXT NOT NULL,
  location_raw TEXT NOT NULL,
  type_code_raw TEXT NOT NULL,
  severity_raw TEXT NOT NULL,
  description_raw TEXT NOT NULL,

  incident_date DATE NOT NULL,
  location TEXT NOT NULL,
  type_code TEXT NOT NULL,
  severity_normalised SMALLINT CHECK (severity_normalised BETWEEN 1 AND 3),
  severity_label TEXT,
  description TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (ingestion_run_id, source_filename, source_row)
);

CREATE INDEX idx_incidents_run ON incidents (ingestion_run_id);
CREATE INDEX idx_incidents_date ON incidents (incident_date);
CREATE INDEX idx_incidents_source_incident_id ON incidents (source_incident_id);
CREATE INDEX idx_incidents_type_code ON incidents (type_code);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs (id) ON DELETE RESTRICT,
  source_filename TEXT NOT NULL,
  source_row INTEGER NOT NULL CHECK (source_row >= 2),

  supplier_name_raw TEXT NOT NULL,
  abn_raw TEXT,
  category_raw TEXT NOT NULL,
  fy_spend_aud_raw TEXT NOT NULL,

  supplier_name TEXT NOT NULL,
  abn TEXT,
  abn_digits TEXT,
  abn_valid BOOLEAN,
  category TEXT,
  fy_spend_aud NUMERIC(14, 2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (ingestion_run_id, source_filename, source_row)
);

CREATE INDEX idx_suppliers_run ON suppliers (ingestion_run_id);

-- Every fixed, flagged, or rejected action with full source traceability.
CREATE TABLE data_quality_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs (id) ON DELETE CASCADE,

  entity_table TEXT NOT NULL,
  entity_id UUID,

  source_filename TEXT NOT NULL,
  source_row INTEGER CHECK (source_row IS NULL OR source_row >= 2),
  field_name TEXT,
  original_value TEXT,
  cleaned_value TEXT,
  action quality_action NOT NULL,
  issue_code TEXT NOT NULL,
  explanation TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_quality_issues_run ON data_quality_issues (ingestion_run_id);
CREATE INDEX idx_data_quality_issues_entity ON data_quality_issues (entity_table, entity_id);
CREATE INDEX idx_data_quality_issues_code ON data_quality_issues (issue_code);

-- AI findings reference incidents.id (internal UUID), not source_incident_id.
CREATE TABLE ai_incident_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,

  finding_type ai_finding_type NOT NULL,
  safety_category TEXT,
  is_psychosocial_hazard BOOLEAN,
  severity_inconsistent BOOLEAN,

  evidence_excerpt TEXT NOT NULL,
  explanation TEXT NOT NULL,
  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (incident_id, finding_type, model, prompt_version)
);

CREATE INDEX idx_ai_incident_analysis_incident ON ai_incident_analysis (incident_id);
CREATE INDEX idx_ai_incident_analysis_type ON ai_incident_analysis (finding_type);
