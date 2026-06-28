--
-- PostgreSQL database dump
--

\restrict iysUTecgFDbR13xTx5a4bU5PN1o3xuOXEB0HexXoTULy52C34K3U079vmXOURfZ

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA audit;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: memory_cosine_similarity(double precision[], double precision[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.memory_cosine_similarity(a double precision[], b double precision[]) RETURNS double precision
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
        SELECT CASE
          WHEN (SELECT sum(x * x) FROM unnest(a) AS x(x)) = 0::float8
            OR (SELECT sum(y * y) FROM unnest(b) AS y(y)) = 0::float8
          THEN 0::float8
          ELSE (
            (SELECT sum(x * y) FROM unnest(a, b) AS t(x, y))
            / (
              sqrt((SELECT sum(x * x) FROM unnest(a) AS x(x)))
              * sqrt((SELECT sum(y * y) FROM unnest(b) AS y(y)))
            )
          )
        END
      $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    agent_id uuid,
    severity character varying(16) DEFAULT 'low'::character varying NOT NULL,
    type character varying(64) NOT NULL,
    message text NOT NULL,
    metadata jsonb,
    status character varying(16) DEFAULT 'open'::character varying NOT NULL,
    handled_at timestamp without time zone,
    handled_by uuid,
    remark text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: agent_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    agent_id uuid,
    action character varying(64) NOT NULL,
    before_state jsonb,
    after_state jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.agent_audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE agent_audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_audit_logs IS 'Agent 閰嶇疆涓庣姸鎬佸彉鏇村璁?;


--
-- Name: COLUMN agent_audit_logs.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_audit_logs.id IS '涓婚敭 UUID';


--
-- Name: COLUMN agent_audit_logs.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_audit_logs.company_id IS '鍏徃 ID';


--
-- Name: COLUMN agent_audit_logs.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_audit_logs.user_id IS '鎿嶄綔浜虹敤鎴?ID';


--
-- Name: COLUMN agent_audit_logs.agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_audit_logs.agent_id IS '鐩稿叧 Agent ID';


--
-- Name: COLUMN agent_audit_logs.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_audit_logs.action IS '鎿嶄綔鍔ㄤ綔鎻忚堪';


--
-- Name: COLUMN agent_audit_logs.before_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_audit_logs.before_state IS '鍙樻洿鍓嶏紙JSON锛?;


--
-- Name: COLUMN agent_audit_logs.after_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_audit_logs.after_state IS '鍙樻洿鍚庯紙JSON锛?;


--
-- Name: COLUMN agent_audit_logs.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_audit_logs.created_at IS '璁板綍鏃堕棿';


--
-- Name: agent_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_skills (
    agent_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source character varying(120),
    is_temporary boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone
);

ALTER TABLE ONLY public.agent_skills FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE agent_skills; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_skills IS 'Agent 涓庢妧鑳藉瀵瑰鍏宠仈琛?;


--
-- Name: COLUMN agent_skills.agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_skills.agent_id IS 'Agent ID';


--
-- Name: COLUMN agent_skills.skill_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_skills.skill_id IS '鎶€鑳?ID';


--
-- Name: COLUMN agent_skills.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_skills.company_id IS '鍏徃 ID锛圧LS锛?;


--
-- Name: COLUMN agent_skills.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_skills.created_at IS '缁戝畾鏃堕棿';


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    organization_node_id uuid,
    name character varying(255) NOT NULL,
    role character varying(64) NOT NULL,
    expertise text,
    avatar_url character varying(500),
    system_prompt text,
    llm_model character varying(120),
    personality jsonb,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    human_in_loop boolean DEFAULT false NOT NULL,
    pending_config jsonb,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    llm_key_id uuid,
    reports_to_agent_id uuid,
    hierarchy_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT chk_agents_role CHECK (((role)::text = ANY ((ARRAY['ceo'::character varying, 'director'::character varying, 'board_member'::character varying, 'executor'::character varying])::text[]))),
    CONSTRAINT chk_agents_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'suspended'::character varying])::text[])))
);

ALTER TABLE ONLY public.agents FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE agents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agents IS '鍏徃鍐?AI Agent 瀹氫箟琛?;


--
-- Name: COLUMN agents.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.id IS '涓婚敭 UUID';


--
-- Name: COLUMN agents.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.company_id IS '鍏徃 ID';


--
-- Name: COLUMN agents.organization_node_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.organization_node_id IS '鍏宠仈缁勭粐鑺傜偣';


--
-- Name: COLUMN agents.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.name IS 'Agent 鍚嶇О';


--
-- Name: COLUMN agents.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.role IS '缁勭粐瑙掕壊锛圕EO/钁ｄ簨/鎵ц绛夛級';


--
-- Name: COLUMN agents.expertise; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.expertise IS '涓撻暱鎻忚堪';


--
-- Name: COLUMN agents.avatar_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.avatar_url IS '澶村儚 URL';


--
-- Name: COLUMN agents.system_prompt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.system_prompt IS '绯荤粺鎻愮ず璇?;


--
-- Name: COLUMN agents.llm_model; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.llm_model IS '榛樿澶фā鍨嬪悕';


--
-- Name: COLUMN agents.personality; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.personality IS '浜烘牸閰嶇疆锛圝SON锛?;


--
-- Name: COLUMN agents.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.status IS '鐘舵€侊細娲昏穬/鍋滅敤/鏆傚仠';


--
-- Name: COLUMN agents.human_in_loop; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.human_in_loop IS '鏄惁闇€瑕佷汉宸ヤ粙鍏?;


--
-- Name: COLUMN agents.pending_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.pending_config IS '寰呯敓鏁堥厤缃紙JSON锛?;


--
-- Name: COLUMN agents.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN agents.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN agents.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agents.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key_id character varying(64) NOT NULL,
    key_hash character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    permissions jsonb,
    expires_at timestamp without time zone,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE api_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.api_keys IS '缃戝叧 API 瀵嗛挜琛?;


--
-- Name: COLUMN api_keys.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.id IS '涓婚敭 UUID';


--
-- Name: COLUMN api_keys.key_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.key_id IS '瀵瑰鍙鐨勫瘑閽?ID';


--
-- Name: COLUMN api_keys.key_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.key_hash IS '瀵嗛挜鍝堝笇锛堜笉钀芥槑鏂囷級';


--
-- Name: COLUMN api_keys.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.name IS '瀵嗛挜鍚嶇О';


--
-- Name: COLUMN api_keys.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.description IS '鎻忚堪';


--
-- Name: COLUMN api_keys.permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.permissions IS '鏉冮檺鑼冨洿锛圝SON锛?;


--
-- Name: COLUMN api_keys.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.expires_at IS '杩囨湡鏃堕棿';


--
-- Name: COLUMN api_keys.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.is_active IS '鏄惁鍚敤';


--
-- Name: COLUMN api_keys.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN api_keys.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_keys.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: approval_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    approval_request_id uuid NOT NULL,
    event_type character varying(32) NOT NULL,
    payload jsonb,
    actor_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.approval_audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: approval_execution_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_execution_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    approval_request_id uuid NOT NULL,
    action character varying(128) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    consumed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    skill_slug character varying(128)
);

ALTER TABLE ONLY public.approval_execution_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    status character varying(24) DEFAULT 'pending'::character varying NOT NULL,
    risk_level character varying(8) DEFAULT 'L2'::character varying NOT NULL,
    action_type character varying(64) NOT NULL,
    context jsonb,
    temporal_workflow_id character varying(256),
    created_by uuid,
    resolved_by uuid,
    resolved_at timestamp without time zone,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_approval_requests_risk CHECK (((risk_level)::text = ANY ((ARRAY['L0'::character varying, 'L1'::character varying, 'L2'::character varying, 'L3'::character varying])::text[]))),
    CONSTRAINT chk_approval_requests_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);

ALTER TABLE ONLY public.approval_requests FORCE ROW LEVEL SECURITY;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id character varying(64),
    user_id uuid,
    api_key_id character varying(64),
    service character varying(50) NOT NULL,
    method character varying(10) NOT NULL,
    path character varying(500) NOT NULL,
    status_code integer NOT NULL,
    request_headers jsonb,
    request_body text,
    response_body text,
    client_ip character varying(45),
    user_agent character varying(500),
    duration_ms integer,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    company_id uuid
);


--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_logs IS '缃戝叧/API 瀹¤鏃ュ織琛?;


--
-- Name: COLUMN audit_logs.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.id IS '涓婚敭 UUID';


--
-- Name: COLUMN audit_logs.request_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.request_id IS '璇锋眰杩借釜 ID';


--
-- Name: COLUMN audit_logs.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.user_id IS '鐢ㄦ埛 ID锛堝彲绌猴級';


--
-- Name: COLUMN audit_logs.api_key_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.api_key_id IS 'API 瀵嗛挜 ID锛堝彲绌猴級';


--
-- Name: COLUMN audit_logs.service; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.service IS '鏈嶅姟鍚嶇О';


--
-- Name: COLUMN audit_logs.method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.method IS 'HTTP 鏂规硶';


--
-- Name: COLUMN audit_logs.path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.path IS '璇锋眰璺緞';


--
-- Name: COLUMN audit_logs.status_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.status_code IS 'HTTP 鐘舵€佺爜';


--
-- Name: COLUMN audit_logs.request_headers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.request_headers IS '璇锋眰澶达紙JSON锛屽凡鑴辨晱锛?;


--
-- Name: COLUMN audit_logs.request_body; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.request_body IS '璇锋眰浣擄紙宸茶劚鏁忥級';


--
-- Name: COLUMN audit_logs.response_body; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.response_body IS '鍝嶅簲浣擄紙宸茶劚鏁忥紝閫氬父浠呴敊璇級';


--
-- Name: COLUMN audit_logs.client_ip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.client_ip IS '瀹㈡埛绔?IP';


--
-- Name: COLUMN audit_logs.user_agent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.user_agent IS 'User-Agent';


--
-- Name: COLUMN audit_logs.duration_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.duration_ms IS '鑰楁椂锛堟绉掞級';


--
-- Name: COLUMN audit_logs.error_message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.error_message IS '閿欒淇℃伅';


--
-- Name: COLUMN audit_logs.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.created_at IS '璁板綍鏃堕棿';


--
-- Name: COLUMN audit_logs.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.company_id IS '鍏徃 ID锛堢鎴蜂笂涓嬫枃锛?;


--
-- Name: billing_balance_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_balance_credits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    company_id uuid NOT NULL,
    budget_id uuid NOT NULL,
    amount numeric(18,4) NOT NULL,
    currency character varying(8) DEFAULT 'USD'::character varying NOT NULL,
    budget_total_after numeric(18,4) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT billing_balance_credits_amount_check CHECK ((amount > (0)::numeric))
);

ALTER TABLE ONLY public.billing_balance_credits FORCE ROW LEVEL SECURITY;


--
-- Name: billing_budget_accruals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_budget_accruals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    scope character varying(32) NOT NULL,
    department_id uuid,
    agent_id uuid,
    accrued_amount numeric(18,6) DEFAULT 0 NOT NULL,
    last_settled_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_billing_budget_accruals_scope CHECK (((scope)::text = ANY ((ARRAY['company'::character varying, 'department'::character varying, 'agent'::character varying])::text[])))
);

ALTER TABLE ONLY public.billing_budget_accruals FORCE ROW LEVEL SECURITY;


--
-- Name: billing_recharge_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_recharge_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    amount numeric(18,4) NOT NULL,
    currency character varying(8) DEFAULT 'USD'::character varying NOT NULL,
    status character varying(24) DEFAULT 'pending'::character varying NOT NULL,
    idempotency_key character varying(128),
    apply_note text,
    reject_reason text,
    requested_by_user_id uuid NOT NULL,
    reviewed_by_user_id uuid,
    reviewed_at timestamp without time zone,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT billing_recharge_orders_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT billing_recharge_orders_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);

ALTER TABLE ONLY public.billing_recharge_orders FORCE ROW LEVEL SECURITY;


--
-- Name: billing_record_idempotency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_record_idempotency (
    company_id uuid NOT NULL,
    idempotency_key character varying(128) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.billing_record_idempotency FORCE ROW LEVEL SECURITY;


--
-- Name: billing_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    department_id uuid,
    agent_id uuid,
    task_id uuid,
    skill_id uuid,
    record_type character varying(32) NOT NULL,
    model_name character varying(120),
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    skill_call_units numeric(12,4) DEFAULT 0 NOT NULL,
    cost numeric(18,6) DEFAULT 0 NOT NULL,
    currency character varying(8) DEFAULT 'USD'::character varying NOT NULL,
    idempotency_key character varying(128),
    metadata jsonb,
    occurred_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    llm_key_id uuid,
    pricing_snapshot_json jsonb,
    pricing_source character varying(32),
    is_nominal boolean DEFAULT false NOT NULL,
    usage_date date NOT NULL,
    CONSTRAINT chk_billing_records_type CHECK (((record_type)::text = ANY ((ARRAY['llm'::character varying, 'skill'::character varying, 'embedding'::character varying, 'summary'::character varying, 'agent_day'::character varying, 'other'::character varying])::text[])))
);

ALTER TABLE ONLY public.billing_records FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE billing_records; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_records IS '璁¤垂娴佹按锛堣拷鍔犲瀷锛岀姝㈠簲鐢ㄥ眰鍒犳敼锛?;


--
-- Name: COLUMN billing_records.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.id IS '涓婚敭 UUID';


--
-- Name: COLUMN billing_records.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.company_id IS '鍏徃 ID';


--
-- Name: COLUMN billing_records.department_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.department_id IS '閮ㄩ棬 ID';


--
-- Name: COLUMN billing_records.agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.agent_id IS 'Agent ID';


--
-- Name: COLUMN billing_records.task_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.task_id IS '浠诲姟 ID';


--
-- Name: COLUMN billing_records.skill_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.skill_id IS '鎶€鑳?ID';


--
-- Name: COLUMN billing_records.record_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.record_type IS '璁板綍绫诲瀷锛歀LM/鎶€鑳?宓屽叆绛?;


--
-- Name: COLUMN billing_records.model_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.model_name IS '妯″瀷鍚嶇О';


--
-- Name: COLUMN billing_records.input_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.input_tokens IS '杈撳叆 token 鏁?;


--
-- Name: COLUMN billing_records.output_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.output_tokens IS '杈撳嚭 token 鏁?;


--
-- Name: COLUMN billing_records.skill_call_units; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.skill_call_units IS '鎶€鑳借皟鐢ㄥ崟浣?;


--
-- Name: COLUMN billing_records.cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.cost IS '璐圭敤';


--
-- Name: COLUMN billing_records.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.currency IS '璐у竵';


--
-- Name: COLUMN billing_records.idempotency_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.idempotency_key IS '骞傜瓑閿紙闃查噸澶嶈璐癸級';


--
-- Name: COLUMN billing_records.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.metadata IS '鎵╁睍淇℃伅锛圝SON锛?;


--
-- Name: COLUMN billing_records.occurred_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.occurred_at IS '涓氬姟鍙戠敓鏃堕棿';


--
-- Name: COLUMN billing_records.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.created_at IS '鍐欏叆鏃堕棿';


--
-- Name: COLUMN billing_records.pricing_snapshot_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.pricing_snapshot_json IS '鍏ヨ处鏃跺埢瀹氫环蹇収锛堜笉鍙拷婧敼浠凤級锛涚己鐪佹椂鍙兘鐢?model_pricing 瑙ｆ瀽缁撴灉鍥炲～';


--
-- Name: COLUMN billing_records.pricing_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.pricing_source IS 'snapshot | model_pricing | explicit_cost | nominal';


--
-- Name: COLUMN billing_records.is_nominal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_records.is_nominal IS '鍚嶄箟娑堣€楋紙濡?task.completed 鍗犱綅 token锛夛紝鎶ヨ〃涓庨绠楀彲涓庣湡瀹?LLM 鍖哄垎';


--
-- Name: billing_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_settings (
    company_id uuid NOT NULL,
    routing_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    degrade_threshold_pct smallint DEFAULT 80 NOT NULL,
    fallback_model character varying(120),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ceo_decision_model character varying(120),
    ceo_decision_llm_key_id uuid,
    agent_token_pricing jsonb,
    agent_usage_aggregate_interval_minutes integer,
    CONSTRAINT billing_settings_degrade_threshold_pct_check CHECK (((degrade_threshold_pct >= 0) AND (degrade_threshold_pct <= 100)))
);

ALTER TABLE ONLY public.billing_settings FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE billing_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_settings IS '鍏徃璁¤垂涓庢ā鍨嬭矾鐢辩瓥鐣ワ紙姣忓叕鍙镐竴琛岋級';


--
-- Name: COLUMN billing_settings.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_settings.company_id IS '鍏徃 ID锛堜富閿級';


--
-- Name: COLUMN billing_settings.routing_policy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_settings.routing_policy IS '璺敱绛栫暐锛圝SON锛?;


--
-- Name: COLUMN billing_settings.degrade_threshold_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_settings.degrade_threshold_pct IS '闄嶇骇闃堝€肩櫨鍒嗘瘮';


--
-- Name: COLUMN billing_settings.fallback_model; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_settings.fallback_model IS '闄嶇骇澶囩敤妯″瀷鍚?;


--
-- Name: COLUMN billing_settings.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_settings.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN billing_settings.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_settings.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    scope character varying(32) DEFAULT 'company'::character varying NOT NULL,
    department_id uuid,
    agent_id uuid,
    period character varying(32) DEFAULT 'monthly'::character varying NOT NULL,
    currency character varying(8) DEFAULT 'USD'::character varying NOT NULL,
    total_amount numeric(18,4) DEFAULT 0 NOT NULL,
    used_amount numeric(18,4) DEFAULT 0 NOT NULL,
    warning_threshold numeric(5,4) DEFAULT 0.8 NOT NULL,
    period_start timestamp without time zone,
    period_end timestamp without time zone,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    critical_threshold numeric(5,4) DEFAULT 0.9 NOT NULL,
    CONSTRAINT budgets_warning_threshold_check CHECK (((warning_threshold >= (0)::numeric) AND (warning_threshold <= (1)::numeric))),
    CONSTRAINT chk_budgets_period CHECK (((period)::text = ANY ((ARRAY['none'::character varying, 'monthly'::character varying, 'quarterly'::character varying])::text[]))),
    CONSTRAINT chk_budgets_scope CHECK (((scope)::text = ANY ((ARRAY['company'::character varying, 'department'::character varying, 'agent'::character varying])::text[]))),
    CONSTRAINT chk_budgets_total_positive CHECK ((total_amount >= (0)::numeric)),
    CONSTRAINT chk_budgets_used_non_negative CHECK ((used_amount >= (0)::numeric))
);

ALTER TABLE ONLY public.budgets FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE budgets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.budgets IS '棰勭畻棰濆害锛堝叕鍙?閮ㄩ棬/Agent 缁村害锛?;


--
-- Name: COLUMN budgets.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.id IS '涓婚敭 UUID';


--
-- Name: COLUMN budgets.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.company_id IS '鍏徃 ID';


--
-- Name: COLUMN budgets.scope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.scope IS '鑼冨洿锛氬叕鍙?閮ㄩ棬/Agent';


--
-- Name: COLUMN budgets.department_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.department_id IS '閮ㄩ棬缁勭粐鑺傜偣 ID';


--
-- Name: COLUMN budgets.agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.agent_id IS 'Agent ID';


--
-- Name: COLUMN budgets.period; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.period IS '鍛ㄦ湡锛氭棤/鏈?瀛?;


--
-- Name: COLUMN budgets.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.currency IS '璐у竵';


--
-- Name: COLUMN budgets.total_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.total_amount IS '棰勭畻鎬婚';


--
-- Name: COLUMN budgets.used_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.used_amount IS '宸茬敤閲戦';


--
-- Name: COLUMN budgets.warning_threshold; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.warning_threshold IS '棰勮闃堝€硷紙0鈥?锛?;


--
-- Name: COLUMN budgets.period_start; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.period_start IS '鍛ㄦ湡寮€濮?;


--
-- Name: COLUMN budgets.period_end; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.period_end IS '鍛ㄦ湡缁撴潫';


--
-- Name: COLUMN budgets.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN budgets.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN budgets.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.budgets.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    room_id uuid NOT NULL,
    seq bigint NOT NULL,
    sender_type character varying(16) NOT NULL,
    sender_id uuid NOT NULL,
    message_type character varying(32) DEFAULT 'text'::character varying NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, COALESCE(content, ''::text))) STORED,
    thread_id uuid,
    memory_references jsonb,
    CONSTRAINT chk_chat_messages_msg_type CHECK (((message_type)::text = ANY ((ARRAY['text'::character varying, 'system'::character varying, 'tool_call'::character varying, 'stream_chunk'::character varying])::text[]))),
    CONSTRAINT chk_chat_messages_sender CHECK (((sender_type)::text = ANY ((ARRAY['human'::character varying, 'agent'::character varying])::text[])))
);

ALTER TABLE ONLY public.chat_messages FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE chat_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chat_messages IS '鑱婂ぉ娑堟伅';


--
-- Name: COLUMN chat_messages.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.id IS '涓婚敭 UUID';


--
-- Name: COLUMN chat_messages.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.company_id IS '鍏徃 ID';


--
-- Name: COLUMN chat_messages.room_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.room_id IS '鎴块棿 ID';


--
-- Name: COLUMN chat_messages.seq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.seq IS '鎴块棿鍐呴€掑搴忓彿';


--
-- Name: COLUMN chat_messages.sender_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.sender_type IS '鍙戦€佹柟绫诲瀷锛歨uman 鎴?agent';


--
-- Name: COLUMN chat_messages.sender_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.sender_id IS '鍙戦€佹柟 ID';


--
-- Name: COLUMN chat_messages.message_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.message_type IS '娑堟伅绫诲瀷锛氭枃鏈?绯荤粺/宸ュ叿璋冪敤/娴佺墖娈电瓑';


--
-- Name: COLUMN chat_messages.content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.content IS '姝ｆ枃鍐呭';


--
-- Name: COLUMN chat_messages.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN chat_messages.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.created_at IS '鍙戦€佹椂闂?;


--
-- Name: COLUMN chat_messages.content_tsv; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_messages.content_tsv IS '鍏ㄦ枃妫€绱㈠悜閲忥紙鐢熸垚鍒楋級';


--
-- Name: chat_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    room_type character varying(32) NOT NULL,
    name character varying(255) NOT NULL,
    organization_node_id uuid,
    task_id uuid,
    created_by uuid,
    metadata jsonb,
    message_seq bigint DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    collaboration_mode character varying(32) DEFAULT 'discussion'::character varying NOT NULL,
    CONSTRAINT chk_chat_rooms_collaboration_mode CHECK (((collaboration_mode)::text = ANY ((ARRAY['discussion'::character varying, 'direct'::character varying, 'execution'::character varying, 'approval_wait'::character varying])::text[]))),
    CONSTRAINT chk_chat_rooms_type CHECK (((room_type)::text = ANY ((ARRAY['main'::character varying, 'department'::character varying, 'task'::character varying, 'custom'::character varying])::text[])))
);

ALTER TABLE ONLY public.chat_rooms FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE chat_rooms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chat_rooms IS '鍗忎綔鑱婂ぉ瀹?;


--
-- Name: COLUMN chat_rooms.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.id IS '涓婚敭 UUID';


--
-- Name: COLUMN chat_rooms.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.company_id IS '鍏徃 ID';


--
-- Name: COLUMN chat_rooms.room_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.room_type IS '鎴块棿绫诲瀷锛氫富浼氳瘽/閮ㄩ棬/浠诲姟/鑷畾涔?;


--
-- Name: COLUMN chat_rooms.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.name IS '鎴块棿鍚嶇О';


--
-- Name: COLUMN chat_rooms.organization_node_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.organization_node_id IS '鍏宠仈缁勭粐鑺傜偣';


--
-- Name: COLUMN chat_rooms.task_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.task_id IS '鍏宠仈浠诲姟 ID';


--
-- Name: COLUMN chat_rooms.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.created_by IS '鍒涘缓浜虹敤鎴?ID';


--
-- Name: COLUMN chat_rooms.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN chat_rooms.message_seq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.message_seq IS '鏈€鏂版秷鎭簭鍙凤紙鍗曡皟閫掑锛?;


--
-- Name: COLUMN chat_rooms.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN chat_rooms.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.chat_rooms.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    industry character varying(120),
    scale character varying(64),
    goal text,
    initial_budget numeric(18,2),
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    slug character varying(120),
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    description text,
    logo_url character varying(500),
    contact_email character varying(255),
    contact_phone character varying(32),
    timezone character varying(64),
    default_language character varying(16),
    industry_code character varying(64),
    execution_paused boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.companies FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE companies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.companies IS '鍏徃锛堢鎴凤級鍩虹淇℃伅琛?;


--
-- Name: COLUMN companies.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.id IS '涓婚敭 UUID';


--
-- Name: COLUMN companies.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.name IS '鍏徃鍚嶇О';


--
-- Name: COLUMN companies.industry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.industry IS '琛屼笟';


--
-- Name: COLUMN companies.scale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.scale IS '瑙勬ā';


--
-- Name: COLUMN companies.goal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.goal IS '缁忚惀鐩爣鎻忚堪';


--
-- Name: COLUMN companies.initial_budget; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.initial_budget IS '鍒濆棰勭畻';


--
-- Name: COLUMN companies.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.is_active IS '鏄惁鍚敤';


--
-- Name: COLUMN companies.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.created_by IS '鍒涘缓浜虹敤鎴?ID';


--
-- Name: COLUMN companies.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN companies.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: COLUMN companies.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.slug IS 'URL 鍙嬪ソ鏍囪瘑';


--
-- Name: COLUMN companies.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.status IS '鐘舵€侊紙濡?active锛?;


--
-- Name: COLUMN companies.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.description IS '鍏徃绠€浠?;


--
-- Name: COLUMN companies.logo_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.logo_url IS 'Logo 鍦板潃';


--
-- Name: COLUMN companies.contact_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.contact_email IS '鑱旂郴閭';


--
-- Name: COLUMN companies.contact_phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.contact_phone IS '鑱旂郴鐢佃瘽';


--
-- Name: COLUMN companies.timezone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.timezone IS '鏃跺尯';


--
-- Name: COLUMN companies.default_language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.default_language IS '榛樿璇█';


--
-- Name: company_ceo_layer_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_ceo_layer_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    ceo_layer_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.company_ceo_layer_configs FORCE ROW LEVEL SECURITY;


--
-- Name: company_embedding_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_embedding_settings (
    company_id uuid NOT NULL,
    default_embedding_model_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: company_marketplace_agent_key_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_marketplace_agent_key_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    marketplace_agent_id uuid CONSTRAINT company_marketplace_agent_key_ass_marketplace_agent_id_not_null NOT NULL,
    assigned_llm_key_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    assigned_embedding_model_id uuid,
    preferred_llm_key_id uuid,
    subscription_id uuid
);

ALTER TABLE ONLY public.company_marketplace_agent_key_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: company_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(64) DEFAULT 'member'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.company_memberships FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE company_memberships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_memberships IS '鐢ㄦ埛涓庡叕鍙告垚鍛樺叧绯昏〃';


--
-- Name: COLUMN company_memberships.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_memberships.id IS '涓婚敭 UUID';


--
-- Name: COLUMN company_memberships.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_memberships.company_id IS '鍏徃 ID';


--
-- Name: COLUMN company_memberships.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_memberships.user_id IS '鐢ㄦ埛 ID';


--
-- Name: COLUMN company_memberships.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_memberships.role IS '鎴愬憳瑙掕壊';


--
-- Name: COLUMN company_memberships.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_memberships.is_active IS '鍏崇郴鏄惁鏈夋晥';


--
-- Name: COLUMN company_memberships.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_memberships.created_at IS '鍔犲叆鏃堕棿';


--
-- Name: COLUMN company_memberships.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_memberships.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: company_runtime_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_runtime_preferences (
    company_id uuid NOT NULL,
    runtime_kind character varying(16) NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_company_runtime_preferences_kind CHECK (((runtime_kind)::text = ANY ((ARRAY['gvisor'::character varying, 'firecracker'::character varying])::text[])))
);

ALTER TABLE ONLY public.company_runtime_preferences FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE company_runtime_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_runtime_preferences IS 'P19锛氱鎴?Runner 闅旂杩愯鏃跺亸濂斤紱鏃犺=缁ф壙闆嗙兢 RUNNER_DEFAULT_RUNTIME_CLASS';


--
-- Name: company_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    version bigint NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.company_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: company_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(120) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    industry character varying(120),
    scale character varying(64),
    template_type character varying(64) DEFAULT 'company'::character varying NOT NULL,
    preview_image_url character varying(500),
    price_cents integer DEFAULT 0 NOT NULL,
    currency character varying(8) DEFAULT 'USD'::character varying NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    version character varying(32) DEFAULT '1.0.0'::character varying NOT NULL,
    usage_count integer DEFAULT 0 NOT NULL,
    rating_avg numeric(4,2),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_company_templates_type CHECK (((template_type)::text = ANY ((ARRAY['company'::character varying, 'industry_pack'::character varying, 'scale_pack'::character varying])::text[]))),
    CONSTRAINT company_templates_price_cents_check CHECK ((price_cents >= 0)),
    CONSTRAINT company_templates_usage_count_check CHECK ((usage_count >= 0))
);


--
-- Name: TABLE company_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_templates IS '鍏徃鍒涘缓妯℃澘鐩綍锛堝钩鍙扮骇锛?;


--
-- Name: COLUMN company_templates.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.id IS '涓婚敭 UUID';


--
-- Name: COLUMN company_templates.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.slug IS 'URL 鍙嬪ソ鍞竴鏍囪瘑';


--
-- Name: COLUMN company_templates.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.name IS '妯℃澘鍚嶇О';


--
-- Name: COLUMN company_templates.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.description IS '鎻忚堪';


--
-- Name: COLUMN company_templates.industry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.industry IS '閫傜敤琛屼笟';


--
-- Name: COLUMN company_templates.scale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.scale IS '閫傜敤瑙勬ā';


--
-- Name: COLUMN company_templates.template_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.template_type IS '妯℃澘绫诲瀷';


--
-- Name: COLUMN company_templates.preview_image_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.preview_image_url IS '棰勮鍥?URL';


--
-- Name: COLUMN company_templates.price_cents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.price_cents IS '浠锋牸锛堝垎锛?;


--
-- Name: COLUMN company_templates.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.currency IS '璐у竵';


--
-- Name: COLUMN company_templates.is_published; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.is_published IS '鏄惁涓婃灦';


--
-- Name: COLUMN company_templates.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.version IS '鐗堟湰鍙?;


--
-- Name: COLUMN company_templates.usage_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.usage_count IS '浣跨敤娆℃暟';


--
-- Name: COLUMN company_templates.rating_avg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.rating_avg IS '骞冲潎璇勫垎';


--
-- Name: COLUMN company_templates.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN company_templates.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN company_templates.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_templates.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: daily_agent_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_agent_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    usage_date date NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    input_cost numeric(18,6) DEFAULT 0 NOT NULL,
    output_cost numeric(18,6) DEFAULT 0 NOT NULL,
    total_cost numeric(18,6) DEFAULT 0 NOT NULL,
    llm_model character varying(120),
    call_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: discussion_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discussion_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    room_id uuid NOT NULL,
    title character varying(512) DEFAULT ''::character varying NOT NULL,
    status character varying(32) DEFAULT 'open'::character varying NOT NULL,
    collaboration_mode character varying(32),
    langgraph_thread_id character varying(512),
    round_count integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_discussion_threads_collab_mode CHECK (((collaboration_mode IS NULL) OR ((collaboration_mode)::text = ANY ((ARRAY['discussion'::character varying, 'direct'::character varying, 'execution'::character varying, 'approval_wait'::character varying])::text[])))),
    CONSTRAINT chk_discussion_threads_status CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'converged'::character varying, 'archived'::character varying])::text[])))
);

ALTER TABLE ONLY public.discussion_threads FORCE ROW LEVEL SECURITY;


--
-- Name: event_idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_idempotency_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_type character varying(80) NOT NULL,
    idempotency_key character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: llm_key_daily_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_key_daily_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    llm_key_id uuid NOT NULL,
    usage_date date NOT NULL,
    used_tokens bigint DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT llm_key_daily_usage_used_tokens_check CHECK ((used_tokens >= 0))
);


--
-- Name: llm_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider character varying(32) NOT NULL,
    model_name character varying(120) NOT NULL,
    key_alias character varying(120) NOT NULL,
    encrypted_secret text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    daily_quota_tokens bigint DEFAULT 0 NOT NULL,
    last_used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    llm_model_id uuid,
    CONSTRAINT llm_keys_daily_quota_tokens_check CHECK ((daily_quota_tokens >= 0))
);


--
-- Name: llm_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_code character varying(32) NOT NULL,
    model_name character varying(120) NOT NULL,
    model_type character varying(24) DEFAULT 'chat'::character varying NOT NULL,
    request_path_suffix character varying(200),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_llm_models_type CHECK (((model_type)::text = ANY ((ARRAY['chat'::character varying, 'embedding'::character varying, 'rerank'::character varying, 'image'::character varying, 'audio'::character varying, 'moderation'::character varying, 'other'::character varying])::text[])))
);


--
-- Name: llm_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(32) NOT NULL,
    display_name character varying(120) DEFAULT ''::character varying NOT NULL,
    kind character varying(16) DEFAULT 'openai'::character varying NOT NULL,
    request_url text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_llm_providers_kind CHECK (((kind)::text = ANY ((ARRAY['openai'::character varying, 'anthropic'::character varying])::text[])))
);


--
-- Name: marketplace_agent_key_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_agent_key_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    marketplace_agent_id uuid NOT NULL,
    llm_key_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ceo_layer character varying(32) DEFAULT 'default'::character varying NOT NULL,
    embedding_model_id uuid,
    embedding_is_primary boolean DEFAULT true NOT NULL
);


--
-- Name: marketplace_agent_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_agent_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    marketplace_agent_id uuid NOT NULL,
    organization_node_id uuid,
    agent_id uuid,
    employment_type character varying(16) DEFAULT 'permanent'::character varying NOT NULL,
    project_id uuid,
    daily_price_cents integer DEFAULT 0 NOT NULL,
    currency character varying(8) DEFAULT 'USD'::character varying NOT NULL,
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    started_on date DEFAULT CURRENT_DATE NOT NULL,
    ended_on date,
    last_billed_on date,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_marketplace_agent_subscriptions_employment_type CHECK (((employment_type)::text = ANY ((ARRAY['permanent'::character varying, 'temporary'::character varying])::text[]))),
    CONSTRAINT chk_marketplace_agent_subscriptions_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT chk_marketplace_agent_subscriptions_temp_requires_project CHECK (((((employment_type)::text = 'temporary'::text) AND (project_id IS NOT NULL)) OR ((employment_type)::text = 'permanent'::text)))
);

ALTER TABLE ONLY public.marketplace_agent_subscriptions FORCE ROW LEVEL SECURITY;


--
-- Name: marketplace_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(120) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    expertise text,
    system_prompt text,
    recommended_skills jsonb,
    is_published boolean DEFAULT false NOT NULL,
    usage_count integer DEFAULT 0 NOT NULL,
    rating_avg numeric(4,2),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    bound_model_name character varying(120),
    skill_tags text[] DEFAULT '{}'::text[] NOT NULL,
    agent_category character varying(32) DEFAULT 'employee'::character varying NOT NULL,
    department_roles text[] DEFAULT '{}'::text[] NOT NULL,
    ceo_layer_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    icon_url character varying(2048),
    recommended_skill_version_ids uuid[],
    CONSTRAINT marketplace_agents_usage_count_check CHECK ((usage_count >= 0))
);


--
-- Name: TABLE marketplace_agents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketplace_agents IS 'Agent 鍟嗗煄鍟嗗搧鐩綍';


--
-- Name: COLUMN marketplace_agents.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.id IS '涓婚敭 UUID';


--
-- Name: COLUMN marketplace_agents.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.slug IS '鍞竴鏍囪瘑';


--
-- Name: COLUMN marketplace_agents.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.name IS '鍚嶇О';


--
-- Name: COLUMN marketplace_agents.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.description IS '鎻忚堪';


--
-- Name: COLUMN marketplace_agents.expertise; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.expertise IS '涓撻暱';


--
-- Name: COLUMN marketplace_agents.system_prompt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.system_prompt IS '绯荤粺鎻愮ず璇?;


--
-- Name: COLUMN marketplace_agents.recommended_skills; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.recommended_skills IS '鎺ㄨ崘鎶€鑳斤紙JSON锛?;


--
-- Name: COLUMN marketplace_agents.is_published; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.is_published IS '鏄惁涓婃灦';


--
-- Name: COLUMN marketplace_agents.usage_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.usage_count IS '浣跨敤娆℃暟';


--
-- Name: COLUMN marketplace_agents.rating_avg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.rating_avg IS '骞冲潎璇勫垎';


--
-- Name: COLUMN marketplace_agents.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN marketplace_agents.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN marketplace_agents.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketplace_agents.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: marketplace_hire_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_hire_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    marketplace_agent_id uuid NOT NULL,
    organization_node_id uuid NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    requested_by_user_id uuid NOT NULL,
    requested_reason text,
    reviewed_by_user_id uuid,
    reviewed_at timestamp without time zone,
    reject_reason text,
    purchase_event_id uuid,
    error_message text,
    result_agent_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    employment_type character varying(16) DEFAULT 'permanent'::character varying NOT NULL,
    project_id uuid,
    CONSTRAINT chk_marketplace_hire_requests_employment_type CHECK (((employment_type)::text = ANY ((ARRAY['permanent'::character varying, 'temporary'::character varying])::text[]))),
    CONSTRAINT chk_marketplace_hire_requests_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'completed'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT chk_marketplace_hire_requests_temp_requires_project CHECK (((((employment_type)::text = 'temporary'::text) AND (project_id IS NOT NULL)) OR ((employment_type)::text = 'permanent'::text)))
);

ALTER TABLE ONLY public.marketplace_hire_requests FORCE ROW LEVEL SECURITY;


--
-- Name: memory_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    namespace character varying(320) NOT NULL,
    label character varying(512),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.memory_collections FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE memory_collections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.memory_collections IS '璁板繂闆嗗悎锛堝懡鍚嶇┖闂达級';


--
-- Name: COLUMN memory_collections.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_collections.id IS '涓婚敭 UUID';


--
-- Name: COLUMN memory_collections.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_collections.company_id IS '鍏徃 ID';


--
-- Name: COLUMN memory_collections.namespace; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_collections.namespace IS '鍛藉悕绌洪棿鏍囪瘑';


--
-- Name: COLUMN memory_collections.label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_collections.label IS '灞曠ず鏍囩';


--
-- Name: COLUMN memory_collections.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_collections.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN memory_collections.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_collections.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: memory_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    from_entry_id uuid NOT NULL,
    to_entry_id uuid,
    edge_type character varying(50) NOT NULL,
    metadata jsonb,
    valid_from timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    valid_to timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_memory_edges_type CHECK (((edge_type)::text = ANY ((ARRAY['summarizes'::character varying, 'promoted_to'::character varying, 'derived_from'::character varying, 'related_to'::character varying, 'caused_by'::character varying])::text[])))
);

ALTER TABLE ONLY public.memory_edges FORCE ROW LEVEL SECURITY;


--
-- Name: memory_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    content text NOT NULL,
    embedding double precision[] NOT NULL,
    metadata jsonb,
    source_type character varying(32) NOT NULL,
    source_ref uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_sensitive boolean DEFAULT false NOT NULL,
    summary text,
    content_search tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, COALESCE(content, ''::text))) STORED,
    importance_score numeric(3,2) DEFAULT 0.5 NOT NULL,
    cycle_depth integer DEFAULT 0 NOT NULL,
    lineage_hash character varying(64),
    retention_class character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    decay_at timestamp without time zone,
    blocked_reason character varying(100),
    CONSTRAINT chk_memory_entries_source CHECK (((source_type)::text = ANY ((ARRAY['chat'::character varying, 'task'::character varying, 'skill'::character varying, 'document'::character varying, 'summary'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT memory_entries_embedding_check CHECK ((array_length(embedding, 1) = 1536))
);

ALTER TABLE ONLY public.memory_entries FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE memory_entries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.memory_entries IS '璁板繂鏉＄洰锛堝悜閲?鏂囨湰锛?;


--
-- Name: COLUMN memory_entries.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.id IS '涓婚敭 UUID';


--
-- Name: COLUMN memory_entries.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.company_id IS '鍏徃 ID';


--
-- Name: COLUMN memory_entries.collection_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.collection_id IS '鎵€灞為泦鍚?ID';


--
-- Name: COLUMN memory_entries.content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.content IS '鏂囨湰鍐呭';


--
-- Name: COLUMN memory_entries.embedding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.embedding IS '宓屽叆鍚戦噺锛坒loat8[]锛岄暱搴?1536锛?;


--
-- Name: COLUMN memory_entries.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN memory_entries.source_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.source_type IS '鏉ユ簮绫诲瀷锛氳亰澶?浠诲姟/鎶€鑳界瓑';


--
-- Name: COLUMN memory_entries.source_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.source_ref IS '鏉ユ簮瀹炰綋 ID';


--
-- Name: COLUMN memory_entries.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.created_at IS '鍐欏叆鏃堕棿';


--
-- Name: COLUMN memory_entries.is_sensitive; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.memory_entries.is_sensitive IS '鏄惁鏁忔劅锛堟绱㈡椂鍙劚鏁忥級';


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: TABLE migrations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.migrations IS 'TypeORM 宸叉墽琛屾暟鎹簱杩佺Щ璁板綍';


--
-- Name: COLUMN migrations.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migrations.id IS '鑷涓婚敭';


--
-- Name: COLUMN migrations."timestamp"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migrations."timestamp" IS '杩佺Щ绫绘椂闂存埑';


--
-- Name: COLUMN migrations.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migrations.name IS '杩佺Щ绫诲悕绉?;


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: model_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    model_name character varying(120) NOT NULL,
    input_price_per_million numeric(18,6) DEFAULT 0 NOT NULL,
    output_price_per_million numeric(18,6) DEFAULT 0 NOT NULL,
    embedding_price_per_million numeric(18,6) DEFAULT 0 NOT NULL,
    skill_base_fee numeric(18,6) DEFAULT 0 NOT NULL,
    currency character varying(8) DEFAULT 'USD'::character varying NOT NULL,
    effective_from timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    effective_to timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.model_pricing FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE model_pricing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.model_pricing IS '妯″瀷鍗曚环锛堝钩鍙伴粯璁や笌鍏徃瑕嗙洊锛?;


--
-- Name: COLUMN model_pricing.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.id IS '涓婚敭 UUID';


--
-- Name: COLUMN model_pricing.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.company_id IS '鍏徃 ID锛堢┖涓哄钩鍙颁环锛?;


--
-- Name: COLUMN model_pricing.model_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.model_name IS '妯″瀷鍚嶇О';


--
-- Name: COLUMN model_pricing.input_price_per_million; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.input_price_per_million IS '杈撳叆姣忕櫨涓?token 浠锋牸';


--
-- Name: COLUMN model_pricing.output_price_per_million; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.output_price_per_million IS '杈撳嚭姣忕櫨涓?token 浠锋牸';


--
-- Name: COLUMN model_pricing.embedding_price_per_million; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.embedding_price_per_million IS '宓屽叆姣忕櫨涓?token 浠锋牸';


--
-- Name: COLUMN model_pricing.skill_base_fee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.skill_base_fee IS '鎶€鑳藉熀纭€璐?;


--
-- Name: COLUMN model_pricing.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.currency IS '璐у竵';


--
-- Name: COLUMN model_pricing.effective_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.effective_from IS '鐢熸晥璧峰鏃堕棿';


--
-- Name: COLUMN model_pricing.effective_to; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.effective_to IS '鐢熸晥缁撴潫鏃堕棿锛堝彲绌猴級';


--
-- Name: COLUMN model_pricing.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN model_pricing.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: oauth_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    provider character varying(50) NOT NULL,
    "providerUserId" character varying(255) NOT NULL,
    "providerUsername" character varying(255),
    "accessToken" text,
    "refreshToken" text,
    "expiresAt" timestamp without time zone,
    "profileData" jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE oauth_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.oauth_accounts IS '绗笁鏂?OAuth 璐﹀彿缁戝畾琛?;


--
-- Name: COLUMN oauth_accounts.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts.id IS '涓婚敭 UUID';


--
-- Name: COLUMN oauth_accounts."userId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts."userId" IS '鍏宠仈鏈湴鐢ㄦ埛 ID';


--
-- Name: COLUMN oauth_accounts.provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts.provider IS '绗笁鏂瑰钩鍙版爣璇?;


--
-- Name: COLUMN oauth_accounts."providerUserId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts."providerUserId" IS '绗笁鏂瑰钩鍙扮敤鎴?ID';


--
-- Name: COLUMN oauth_accounts."providerUsername"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts."providerUsername" IS '绗笁鏂瑰钩鍙板睍绀哄悕';


--
-- Name: COLUMN oauth_accounts."accessToken"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts."accessToken" IS '璁块棶浠ょ墝';


--
-- Name: COLUMN oauth_accounts."refreshToken"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts."refreshToken" IS '鍒锋柊浠ょ墝';


--
-- Name: COLUMN oauth_accounts."expiresAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts."expiresAt" IS '璁块棶浠ょ墝杩囨湡鏃堕棿';


--
-- Name: COLUMN oauth_accounts."profileData"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts."profileData" IS '绗笁鏂圭敤鎴疯祫鏂欙紙JSON锛?;


--
-- Name: COLUMN oauth_accounts."createdAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts."createdAt" IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN oauth_accounts."updatedAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.oauth_accounts."updatedAt" IS '鏇存柊鏃堕棿';


--
-- Name: organization_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    node_id uuid NOT NULL,
    action character varying(24) NOT NULL,
    before_state jsonb,
    after_state jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_organization_audit_action CHECK (((action)::text = ANY ((ARRAY['create'::character varying, 'update'::character varying, 'move'::character varying, 'delete'::character varying])::text[])))
);

ALTER TABLE ONLY public.organization_audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE organization_audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organization_audit_logs IS '缁勭粐鏋舵瀯鍙樻洿瀹¤琛?;


--
-- Name: COLUMN organization_audit_logs.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_audit_logs.id IS '涓婚敭 UUID';


--
-- Name: COLUMN organization_audit_logs.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_audit_logs.company_id IS '鍏徃 ID';


--
-- Name: COLUMN organization_audit_logs.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_audit_logs.user_id IS '鎿嶄綔浜虹敤鎴?ID';


--
-- Name: COLUMN organization_audit_logs.node_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_audit_logs.node_id IS '琚搷浣滅殑缁勭粐鑺傜偣 ID';


--
-- Name: COLUMN organization_audit_logs.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_audit_logs.action IS '鎿嶄綔绫诲瀷锛氬垱寤?鏇存柊/绉诲姩/鍒犻櫎';


--
-- Name: COLUMN organization_audit_logs.before_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_audit_logs.before_state IS '鍙樻洿鍓嶅揩鐓э紙JSON锛?;


--
-- Name: COLUMN organization_audit_logs.after_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_audit_logs.after_state IS '鍙樻洿鍚庡揩鐓э紙JSON锛?;


--
-- Name: COLUMN organization_audit_logs.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_audit_logs.created_at IS '璁板綍鏃堕棿';


--
-- Name: organization_node_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_node_skills (
    organization_node_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.organization_node_skills FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE organization_node_skills; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organization_node_skills IS '缁勭粐鑺傜偣涓庡彲鐢ㄦ妧鑳藉叧鑱?;


--
-- Name: COLUMN organization_node_skills.organization_node_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_node_skills.organization_node_id IS '缁勭粐鑺傜偣 ID';


--
-- Name: COLUMN organization_node_skills.skill_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_node_skills.skill_id IS '鎶€鑳?ID';


--
-- Name: COLUMN organization_node_skills.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_node_skills.company_id IS '鍏徃 ID';


--
-- Name: COLUMN organization_node_skills.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_node_skills.created_at IS '缁戝畾鏃堕棿';


--
-- Name: organization_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    parent_id uuid,
    type character varying(24) NOT NULL,
    name character varying(120) NOT NULL,
    description text,
    agent_id uuid,
    order_no integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_organization_node_type CHECK (((type)::text = ANY ((ARRAY['board'::character varying, 'ceo'::character varying, 'department'::character varying, 'agent'::character varying])::text[])))
);

ALTER TABLE ONLY public.organization_nodes FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE organization_nodes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.organization_nodes IS '缁勭粐鏋舵瀯鑺傜偣琛紙鏍戝舰锛?;


--
-- Name: COLUMN organization_nodes.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.id IS '涓婚敭 UUID';


--
-- Name: COLUMN organization_nodes.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.company_id IS '鍏徃 ID';


--
-- Name: COLUMN organization_nodes.parent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.parent_id IS '鐖惰妭鐐?ID';


--
-- Name: COLUMN organization_nodes.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.type IS '鑺傜偣绫诲瀷锛氳懀浜嬩細/CEO/閮ㄩ棬/Agent 绛?;


--
-- Name: COLUMN organization_nodes.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.name IS '鑺傜偣鍚嶇О';


--
-- Name: COLUMN organization_nodes.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.description IS '鎻忚堪';


--
-- Name: COLUMN organization_nodes.agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.agent_id IS '缁戝畾鐨?Agent ID';


--
-- Name: COLUMN organization_nodes.order_no; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.order_no IS '鍚岀骇鎺掑簭';


--
-- Name: COLUMN organization_nodes.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN organization_nodes.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN organization_nodes.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organization_nodes.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: platform_department_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_department_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform_department_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    action character varying(24) NOT NULL,
    previous_marketplace_agent_id uuid,
    new_marketplace_agent_id uuid,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(64) NOT NULL,
    display_name character varying(120) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    director_marketplace_agent_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    category character varying(32),
    icon character varying(64),
    recommended_head_token character varying(64),
    default_skills jsonb,
    is_default_for_new_company boolean DEFAULT false NOT NULL
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key character varying(80) NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE platform_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.platform_settings IS '骞冲彴绾ч厤缃紙閿€?JSON锛?;


--
-- Name: COLUMN platform_settings.key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_settings.key IS '閰嶇疆閿?;


--
-- Name: COLUMN platform_settings.value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_settings.value IS '閰嶇疆鍊硷紙JSON锛?;


--
-- Name: COLUMN platform_settings.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_settings.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: room_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    room_id uuid NOT NULL,
    member_type character varying(16) NOT NULL,
    member_id uuid NOT NULL,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    left_at timestamp without time zone,
    last_read_seq bigint DEFAULT 0 NOT NULL,
    CONSTRAINT chk_room_members_type CHECK (((member_type)::text = ANY ((ARRAY['human'::character varying, 'agent'::character varying])::text[])))
);

ALTER TABLE ONLY public.room_members FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE room_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.room_members IS '鑱婂ぉ瀹ゆ垚鍛橈紙浜烘垨 Agent锛?;


--
-- Name: COLUMN room_members.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.room_members.id IS '涓婚敭 UUID';


--
-- Name: COLUMN room_members.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.room_members.company_id IS '鍏徃 ID';


--
-- Name: COLUMN room_members.room_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.room_members.room_id IS '鎴块棿 ID';


--
-- Name: COLUMN room_members.member_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.room_members.member_type IS '鎴愬憳绫诲瀷锛歨uman 鎴?agent';


--
-- Name: COLUMN room_members.member_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.room_members.member_id IS '鐢ㄦ埛 ID 鎴?Agent ID';


--
-- Name: COLUMN room_members.joined_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.room_members.joined_at IS '鍔犲叆鏃堕棿';


--
-- Name: COLUMN room_members.left_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.room_members.left_at IS '绂诲紑鏃堕棿';


--
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    path character varying(255) NOT NULL,
    service character varying(50) NOT NULL,
    rewrite_path character varying(255),
    auth_required boolean DEFAULT true,
    is_active boolean DEFAULT true,
    priority integer DEFAULT 0,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    transport character varying(16) DEFAULT 'http'::character varying NOT NULL,
    rpc_client_name character varying(32),
    rpc_pattern character varying(128),
    rpc_timeout_ms integer
);


--
-- Name: TABLE routes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.routes IS '缃戝叧璺敱涓庤浆鍙戣鍒欒〃';


--
-- Name: COLUMN routes.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.id IS '涓婚敭 UUID';


--
-- Name: COLUMN routes.path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.path IS '鍖归厤璺緞';


--
-- Name: COLUMN routes.service; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.service IS '鐩爣鏈嶅姟鍚?;


--
-- Name: COLUMN routes.rewrite_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.rewrite_path IS '璺緞閲嶅啓鐩爣';


--
-- Name: COLUMN routes.auth_required; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.auth_required IS '鏄惁闇€瑕佽璇?;


--
-- Name: COLUMN routes.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.is_active IS '鏄惁鍚敤';


--
-- Name: COLUMN routes.priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.priority IS '鍖归厤浼樺厛绾э紙鏁板€艰秺澶ц秺浼樺厛锛?;


--
-- Name: COLUMN routes.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.description IS '璇存槑';


--
-- Name: COLUMN routes.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN routes.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: COLUMN routes.transport; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.transport IS '浼犺緭鏂瑰紡锛歨ttp 鎴?rpc';


--
-- Name: COLUMN routes.rpc_client_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.rpc_client_name IS 'RPC 瀹㈡埛绔悕绉?;


--
-- Name: COLUMN routes.rpc_pattern; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.rpc_pattern IS 'RPC 娑堟伅妯″紡';


--
-- Name: COLUMN routes.rpc_timeout_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.rpc_timeout_ms IS 'RPC 瓒呮椂姣';


--
-- Name: skill_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    skill_id uuid,
    storage_path text NOT NULL,
    sha256 character varying(64),
    size_bytes bigint,
    content_type character varying(120),
    original_name character varying(255),
    created_by_user_id uuid,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.skill_artifacts FORCE ROW LEVEL SECURITY;


--
-- Name: skill_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    skill_id uuid,
    skill_name character varying(255),
    action_type character varying(32) NOT NULL,
    changed_by_user_id uuid,
    before_state jsonb,
    after_state jsonb,
    scan_result jsonb,
    risk_level character varying(16),
    review_status character varying(16) DEFAULT 'logged'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.skill_audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE skill_audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.skill_audit_logs IS '骞冲彴鍏ㄥ眬 Skills 瀹¤鏃ュ織';


--
-- Name: skill_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_execution_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    skill_id uuid,
    skill_name character varying(255) NOT NULL,
    trace_id character varying(255),
    args_summary jsonb,
    result_summary jsonb,
    duration_ms integer,
    billing_units numeric(12,4),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.skill_execution_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE skill_execution_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.skill_execution_logs IS '鎶€鑳借皟鐢ㄦ墽琛屾棩蹇?;


--
-- Name: COLUMN skill_execution_logs.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.id IS '涓婚敭 UUID';


--
-- Name: COLUMN skill_execution_logs.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.company_id IS '鍏徃 ID';


--
-- Name: COLUMN skill_execution_logs.agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.agent_id IS '璋冪敤鏂?Agent ID';


--
-- Name: COLUMN skill_execution_logs.skill_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.skill_id IS '鎶€鑳?ID锛堝彲绌鸿嫢宸插垹锛?;


--
-- Name: COLUMN skill_execution_logs.skill_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.skill_name IS '鎶€鑳藉悕绉板揩鐓?;


--
-- Name: COLUMN skill_execution_logs.trace_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.trace_id IS '鍒嗗竷寮忚拷韪?ID';


--
-- Name: COLUMN skill_execution_logs.args_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.args_summary IS '鍏ュ弬鎽樿锛圝SON锛?;


--
-- Name: COLUMN skill_execution_logs.result_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.result_summary IS '缁撴灉鎽樿锛圝SON锛?;


--
-- Name: COLUMN skill_execution_logs.duration_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.duration_ms IS '鑰楁椂锛堟绉掞級';


--
-- Name: COLUMN skill_execution_logs.billing_units; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.billing_units IS '璁¤垂鍗曚綅';


--
-- Name: COLUMN skill_execution_logs.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skill_execution_logs.created_at IS '璁板綍鏃堕棿';


--
-- Name: skill_mcp_tool_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_mcp_tool_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    skill_id uuid NOT NULL,
    mcp_tool_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.skill_mcp_tool_bindings FORCE ROW LEVEL SECURITY;


--
-- Name: skill_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    company_id uuid,
    version integer NOT NULL,
    status character varying(16) DEFAULT 'published'::character varying NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    tool_schema jsonb,
    prompt_template text,
    implementation_type character varying(32) DEFAULT 'builtin'::character varying NOT NULL,
    handler_config jsonb,
    required_permissions jsonb,
    is_public boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    metadata jsonb,
    artifact_id uuid,
    created_by_user_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    review_status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    risk_level character varying(16),
    scan_result jsonb,
    review_comment text,
    reviewed_by_user_id uuid,
    reviewed_at timestamp without time zone,
    CONSTRAINT chk_skill_revision_impl_type CHECK (((implementation_type)::text = ANY ((ARRAY['builtin'::character varying, 'langgraph'::character varying, 'api'::character varying, 'external'::character varying])::text[]))),
    CONSTRAINT chk_skill_revision_review_status CHECK (((review_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT chk_skill_revision_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'revoked'::character varying])::text[])))
);

ALTER TABLE ONLY public.skill_revisions FORCE ROW LEVEL SECURITY;


--
-- Name: skill_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    company_id uuid,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.skill_versions FORCE ROW LEVEL SECURITY;


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    name character varying(255) NOT NULL,
    tool_schema jsonb,
    prompt_template text,
    implementation_type character varying(32) DEFAULT 'builtin'::character varying NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    description text,
    handler_config jsonb,
    required_permissions jsonb,
    version integer DEFAULT 1 NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    current_revision_id uuid,
    published_revision_id uuid,
    semver_version character varying(64) DEFAULT '1.0.0'::character varying NOT NULL,
    is_latest boolean DEFAULT true NOT NULL,
    changelog text,
    display_name character varying(200),
    input_schema jsonb,
    output_schema jsonb,
    security_profile character varying(24) DEFAULT 'safe'::character varying NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    approval_request_id uuid,
    approval_status character varying(16) DEFAULT 'none'::character varying NOT NULL,
    change_reason text,
    created_by uuid,
    updated_by uuid,
    max_input_tokens integer,
    max_output_tokens integer,
    max_input_size_bytes integer,
    timeout_seconds integer DEFAULT 300,
    chunk_strategy character varying(16) DEFAULT 'none'::character varying,
    category jsonb,
    icon text,
    CONSTRAINT chk_skills_impl_type CHECK (((implementation_type)::text = ANY ((ARRAY['builtin'::character varying, 'langgraph'::character varying, 'api'::character varying, 'external'::character varying])::text[])))
);

ALTER TABLE ONLY public.skills FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE skills; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.skills IS '鎶€鑳藉畾涔夎〃锛堝惈骞冲彴绾т笌鍏徃绾э級';


--
-- Name: COLUMN skills.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.id IS '涓婚敭 UUID';


--
-- Name: COLUMN skills.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.company_id IS '鍏徃 ID锛堢┖琛ㄧず骞冲彴鍏ㄥ眬鎶€鑳斤級';


--
-- Name: COLUMN skills.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.name IS '鎶€鑳藉悕绉?;


--
-- Name: COLUMN skills.tool_schema; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.tool_schema IS '宸ュ叿鍙傛暟 JSON Schema';


--
-- Name: COLUMN skills.prompt_template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.prompt_template IS '鎻愮ず妯℃澘';


--
-- Name: COLUMN skills.implementation_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.implementation_type IS '瀹炵幇绫诲瀷锛歜uiltin/langgraph/api/external';


--
-- Name: COLUMN skills.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN skills.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN skills.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: COLUMN skills.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.description IS '璇存槑';


--
-- Name: COLUMN skills.handler_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.handler_config IS '澶勭悊鍣ㄩ厤缃紙JSON锛?;


--
-- Name: COLUMN skills.required_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.required_permissions IS '鎵€闇€鏉冮檺锛圝SON 鏁扮粍锛?;


--
-- Name: COLUMN skills.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.version IS '鐗堟湰鍙?;


--
-- Name: COLUMN skills.is_public; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.is_public IS '鏄惁瀵圭鎴峰彲瑙?;


--
-- Name: COLUMN skills.is_system; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.skills.is_system IS '鏄惁涓虹郴缁熷唴缃妧鑳?;


--
-- Name: supervisor_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supervisor_lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    run_id uuid NOT NULL,
    task_id uuid,
    failure_signature_hash character varying(64) NOT NULL,
    root_cause text NOT NULL,
    lesson text NOT NULL,
    preventive_action text NOT NULL,
    confidence real NOT NULL,
    impact_on_budget_or_roi real,
    ingested_to_memory boolean DEFAULT false NOT NULL,
    is_repeat_pattern boolean DEFAULT false NOT NULL,
    memory_entry_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: task_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    task_id uuid NOT NULL,
    assignee_type character varying(32) NOT NULL,
    assignee_id uuid,
    assigned_by_user_id uuid,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    unassigned_at timestamp without time zone,
    note text,
    CONSTRAINT chk_task_assignments_type CHECK (((assignee_type)::text = ANY ((ARRAY['unassigned'::character varying, 'agent'::character varying, 'organization_node'::character varying])::text[])))
);

ALTER TABLE ONLY public.task_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE task_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.task_assignments IS '浠诲姟鎸囨淳鍘嗗彶';


--
-- Name: COLUMN task_assignments.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_assignments.id IS '涓婚敭 UUID';


--
-- Name: COLUMN task_assignments.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_assignments.company_id IS '鍏徃 ID';


--
-- Name: COLUMN task_assignments.task_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_assignments.task_id IS '浠诲姟 ID';


--
-- Name: COLUMN task_assignments.assignee_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_assignments.assignee_type IS '鍙楁寚娲句汉绫诲瀷';


--
-- Name: COLUMN task_assignments.assignee_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_assignments.assignee_id IS '鍙楁寚娲句汉 ID';


--
-- Name: COLUMN task_assignments.assigned_by_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_assignments.assigned_by_user_id IS '鎸囨淳浜虹敤鎴?ID';


--
-- Name: COLUMN task_assignments.assigned_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_assignments.assigned_at IS '鎸囨淳鏃堕棿';


--
-- Name: COLUMN task_assignments.unassigned_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_assignments.unassigned_at IS '鍙栨秷鎸囨淳鏃堕棿';


--
-- Name: COLUMN task_assignments.note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_assignments.note IS '澶囨敞';


--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    task_id uuid NOT NULL,
    depends_on_task_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_task_dep_no_self CHECK ((task_id <> depends_on_task_id))
);

ALTER TABLE ONLY public.task_dependencies FORCE ROW LEVEL SECURITY;


--
-- Name: task_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_execution_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    task_id uuid,
    agent_id uuid,
    step_type character varying(64) NOT NULL,
    message text,
    output_snapshot jsonb,
    billing_units numeric(12,4),
    duration_ms integer,
    trace_id character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    run_id uuid
);

ALTER TABLE ONLY public.task_execution_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE task_execution_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.task_execution_logs IS '浠诲姟鎵ц姝ラ鏃ュ織';


--
-- Name: COLUMN task_execution_logs.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.id IS '涓婚敭 UUID';


--
-- Name: COLUMN task_execution_logs.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.company_id IS '鍏徃 ID';


--
-- Name: COLUMN task_execution_logs.task_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.task_id IS '浠诲姟 ID';


--
-- Name: COLUMN task_execution_logs.agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.agent_id IS '鎵ц Agent ID';


--
-- Name: COLUMN task_execution_logs.step_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.step_type IS '姝ラ绫诲瀷';


--
-- Name: COLUMN task_execution_logs.message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.message IS '鏂囨湰璇存槑';


--
-- Name: COLUMN task_execution_logs.output_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.output_snapshot IS '杈撳嚭蹇収锛圝SON锛?;


--
-- Name: COLUMN task_execution_logs.billing_units; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.billing_units IS '璁¤垂鍗曚綅';


--
-- Name: COLUMN task_execution_logs.duration_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.duration_ms IS '鑰楁椂锛堟绉掞級';


--
-- Name: COLUMN task_execution_logs.trace_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.trace_id IS '杩借釜 ID';


--
-- Name: COLUMN task_execution_logs.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task_execution_logs.created_at IS '璁板綍鏃堕棿';


--
-- Name: task_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    trigger_source character varying(32) DEFAULT 'manual'::character varying NOT NULL,
    temporal_workflow_id character varying(256),
    temporal_run_id character varying(128),
    status character varying(32) DEFAULT 'running'::character varying NOT NULL,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    finished_at timestamp without time zone,
    error_summary text,
    cost_estimate numeric(14,4),
    metadata jsonb,
    actual_cost numeric(14,4),
    approval_request_id uuid,
    CONSTRAINT chk_task_runs_status CHECK (((status)::text = ANY ((ARRAY['running'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT chk_task_runs_trigger CHECK (((trigger_source)::text = ANY ((ARRAY['temporal'::character varying, 'schedule'::character varying, 'manual'::character varying, 'nest_timer'::character varying])::text[])))
);

ALTER TABLE ONLY public.task_runs FORCE ROW LEVEL SECURITY;


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    parent_id uuid,
    title character varying(512) NOT NULL,
    description text,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    priority character varying(32) DEFAULT 'normal'::character varying NOT NULL,
    due_date timestamp without time zone,
    expected_output text,
    progress smallint DEFAULT 0 NOT NULL,
    assignee_type character varying(32) DEFAULT 'unassigned'::character varying NOT NULL,
    assignee_id uuid,
    skill_ids jsonb,
    blocked_reason text,
    requires_human_approval boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_by_user_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    approval_flow_id uuid,
    CONSTRAINT chk_tasks_assignee_type CHECK (((assignee_type)::text = ANY ((ARRAY['unassigned'::character varying, 'agent'::character varying, 'organization_node'::character varying])::text[]))),
    CONSTRAINT chk_tasks_priority CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT chk_tasks_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'review'::character varying, 'awaiting_approval'::character varying, 'completed'::character varying, 'blocked'::character varying, 'cancelled'::character varying, 'paused'::character varying])::text[]))),
    CONSTRAINT tasks_progress_check CHECK (((progress >= 0) AND (progress <= 100)))
);

ALTER TABLE ONLY public.tasks FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE tasks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tasks IS '浠诲姟琛紙鏀寔鐖跺瓙浠诲姟锛?;


--
-- Name: COLUMN tasks.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.id IS '涓婚敭 UUID';


--
-- Name: COLUMN tasks.company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.company_id IS '鍏徃 ID';


--
-- Name: COLUMN tasks.parent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.parent_id IS '鐖朵换鍔?ID';


--
-- Name: COLUMN tasks.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.title IS '鏍囬';


--
-- Name: COLUMN tasks.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.description IS '鎻忚堪';


--
-- Name: COLUMN tasks.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.status IS '鐘舵€?;


--
-- Name: COLUMN tasks.priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.priority IS '浼樺厛绾?;


--
-- Name: COLUMN tasks.due_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.due_date IS '鎴鏃堕棿';


--
-- Name: COLUMN tasks.expected_output; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.expected_output IS '鏈熸湜浜у嚭璇存槑';


--
-- Name: COLUMN tasks.progress; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.progress IS '杩涘害 0鈥?00';


--
-- Name: COLUMN tasks.assignee_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.assignee_type IS '鍙楁寚娲句汉绫诲瀷';


--
-- Name: COLUMN tasks.assignee_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.assignee_id IS '鍙楁寚娲句汉/鑺傜偣 ID';


--
-- Name: COLUMN tasks.skill_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.skill_ids IS '鍏宠仈鎶€鑳?ID 鍒楄〃锛圝SON锛?;


--
-- Name: COLUMN tasks.blocked_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.blocked_reason IS '闃诲鍘熷洜';


--
-- Name: COLUMN tasks.requires_human_approval; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.requires_human_approval IS '鏄惁闇€瑕佷汉宸ュ鎵?;


--
-- Name: COLUMN tasks.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.metadata IS '鎵╁睍鍏冩暟鎹紙JSON锛?;


--
-- Name: COLUMN tasks.created_by_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.created_by_user_id IS '鍒涘缓浜虹敤鎴?ID';


--
-- Name: COLUMN tasks.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN tasks.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tasks.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: template_agent_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_agent_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    marketplace_agent_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    role_hint character varying(64),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: TABLE template_agent_mappings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.template_agent_mappings IS '妯℃澘涓庡晢鍩?Agent 鍏宠仈';


--
-- Name: COLUMN template_agent_mappings.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_agent_mappings.id IS '涓婚敭 UUID';


--
-- Name: COLUMN template_agent_mappings.template_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_agent_mappings.template_id IS '妯℃澘 ID';


--
-- Name: COLUMN template_agent_mappings.marketplace_agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_agent_mappings.marketplace_agent_id IS '鍟嗗煄 Agent ID';


--
-- Name: COLUMN template_agent_mappings.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_agent_mappings.sort_order IS '鎺掑簭';


--
-- Name: COLUMN template_agent_mappings.role_hint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_agent_mappings.role_hint IS '瑙掕壊鎻愮ず';


--
-- Name: COLUMN template_agent_mappings.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_agent_mappings.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: template_contents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_contents (
    template_id uuid NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: TABLE template_contents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.template_contents IS '妯℃澘鍐呭蹇収锛堜竴瀵逛竴锛?;


--
-- Name: COLUMN template_contents.template_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_contents.template_id IS '妯℃澘 ID锛堜富閿級';


--
-- Name: COLUMN template_contents.content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_contents.content IS '缁撴瀯鍖栨ā鏉垮唴瀹癸紙JSON锛?;


--
-- Name: COLUMN template_contents.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_contents.created_at IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN template_contents.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.template_contents.updated_at IS '鏇存柊鏃堕棿';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    "passwordHash" character varying(255) NOT NULL,
    roles jsonb DEFAULT '[]'::jsonb NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "lastLoginAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp without time zone
);


--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.users IS '鐢ㄦ埛琛?;


--
-- Name: COLUMN users.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.id IS '涓婚敭 UUID';


--
-- Name: COLUMN users.username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.username IS '鐢ㄦ埛鍚?;


--
-- Name: COLUMN users.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.email IS '閭';


--
-- Name: COLUMN users."passwordHash"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users."passwordHash" IS '瀵嗙爜鍝堝笇';


--
-- Name: COLUMN users.roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.roles IS '瑙掕壊鍒楄〃锛圝SON 鏁扮粍锛?;


--
-- Name: COLUMN users.permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.permissions IS '鏉冮檺鍒楄〃锛圝SON 鏁扮粍锛?;


--
-- Name: COLUMN users.enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.enabled IS '鏄惁鍚敤';


--
-- Name: COLUMN users."lastLoginAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users."lastLoginAt" IS '鏈€鍚庣櫥褰曟椂闂?;


--
-- Name: COLUMN users."createdAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users."createdAt" IS '鍒涘缓鏃堕棿';


--
-- Name: COLUMN users."updatedAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users."updatedAt" IS '鏇存柊鏃堕棿';


--
-- Name: COLUMN users."deletedAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users."deletedAt" IS '杞垹闄ゆ椂闂达紙涓虹┖琛ㄧず鏈垹闄わ級';


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: oauth_accounts PK_oauth_accounts; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_accounts
    ADD CONSTRAINT "PK_oauth_accounts" PRIMARY KEY (id);


--
-- Name: users PK_users; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_users" PRIMARY KEY (id);


--
-- Name: admin_alerts admin_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_alerts
    ADD CONSTRAINT admin_alerts_pkey PRIMARY KEY (id);


--
-- Name: agent_audit_logs agent_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_audit_logs
    ADD CONSTRAINT agent_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: agent_skills agent_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_skills
    ADD CONSTRAINT agent_skills_pkey PRIMARY KEY (agent_id, skill_id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_id_key UNIQUE (key_id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: approval_audit_logs approval_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_audit_logs
    ADD CONSTRAINT approval_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: approval_execution_tokens approval_execution_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_execution_tokens
    ADD CONSTRAINT approval_execution_tokens_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: billing_balance_credits billing_balance_credits_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_balance_credits
    ADD CONSTRAINT billing_balance_credits_order_id_key UNIQUE (order_id);


--
-- Name: billing_balance_credits billing_balance_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_balance_credits
    ADD CONSTRAINT billing_balance_credits_pkey PRIMARY KEY (id);


--
-- Name: billing_budget_accruals billing_budget_accruals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_budget_accruals
    ADD CONSTRAINT billing_budget_accruals_pkey PRIMARY KEY (id);


--
-- Name: billing_recharge_orders billing_recharge_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_recharge_orders
    ADD CONSTRAINT billing_recharge_orders_pkey PRIMARY KEY (id);


--
-- Name: billing_record_idempotency billing_record_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_record_idempotency
    ADD CONSTRAINT billing_record_idempotency_pkey PRIMARY KEY (company_id, idempotency_key);


--
-- Name: billing_records billing_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_records
    ADD CONSTRAINT billing_records_pkey PRIMARY KEY (id);


--
-- Name: billing_settings billing_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_settings
    ADD CONSTRAINT billing_settings_pkey PRIMARY KEY (company_id);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_rooms chat_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_ceo_layer_configs company_ceo_layer_configs_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_ceo_layer_configs
    ADD CONSTRAINT company_ceo_layer_configs_company_id_key UNIQUE (company_id);


--
-- Name: company_ceo_layer_configs company_ceo_layer_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_ceo_layer_configs
    ADD CONSTRAINT company_ceo_layer_configs_pkey PRIMARY KEY (id);


--
-- Name: company_embedding_settings company_embedding_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_embedding_settings
    ADD CONSTRAINT company_embedding_settings_pkey PRIMARY KEY (company_id);


--
-- Name: company_marketplace_agent_key_assignments company_marketplace_agent_key_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_marketplace_agent_key_assignments
    ADD CONSTRAINT company_marketplace_agent_key_assignments_pkey PRIMARY KEY (id);


--
-- Name: company_memberships company_memberships_company_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_company_id_user_id_key UNIQUE (company_id, user_id);


--
-- Name: company_memberships company_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_pkey PRIMARY KEY (id);


--
-- Name: company_runtime_preferences company_runtime_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_runtime_preferences
    ADD CONSTRAINT company_runtime_preferences_pkey PRIMARY KEY (company_id);


--
-- Name: company_snapshots company_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_snapshots
    ADD CONSTRAINT company_snapshots_pkey PRIMARY KEY (id);


--
-- Name: company_templates company_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_templates
    ADD CONSTRAINT company_templates_pkey PRIMARY KEY (id);


--
-- Name: daily_agent_usage daily_agent_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_agent_usage
    ADD CONSTRAINT daily_agent_usage_pkey PRIMARY KEY (id);


--
-- Name: discussion_threads discussion_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discussion_threads
    ADD CONSTRAINT discussion_threads_pkey PRIMARY KEY (id);


--
-- Name: event_idempotency_keys event_idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_idempotency_keys
    ADD CONSTRAINT event_idempotency_keys_pkey PRIMARY KEY (id);


--
-- Name: llm_key_daily_usage llm_key_daily_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_key_daily_usage
    ADD CONSTRAINT llm_key_daily_usage_pkey PRIMARY KEY (id);


--
-- Name: llm_keys llm_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_keys
    ADD CONSTRAINT llm_keys_pkey PRIMARY KEY (id);


--
-- Name: llm_models llm_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_models
    ADD CONSTRAINT llm_models_pkey PRIMARY KEY (id);


--
-- Name: llm_providers llm_providers_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_providers
    ADD CONSTRAINT llm_providers_code_key UNIQUE (code);


--
-- Name: llm_providers llm_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_providers
    ADD CONSTRAINT llm_providers_pkey PRIMARY KEY (id);


--
-- Name: marketplace_agent_key_bindings marketplace_agent_key_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_key_bindings
    ADD CONSTRAINT marketplace_agent_key_bindings_pkey PRIMARY KEY (id);


--
-- Name: marketplace_agent_subscriptions marketplace_agent_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_subscriptions
    ADD CONSTRAINT marketplace_agent_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: marketplace_agents marketplace_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agents
    ADD CONSTRAINT marketplace_agents_pkey PRIMARY KEY (id);


--
-- Name: marketplace_hire_requests marketplace_hire_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_hire_requests
    ADD CONSTRAINT marketplace_hire_requests_pkey PRIMARY KEY (id);


--
-- Name: memory_collections memory_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_collections
    ADD CONSTRAINT memory_collections_pkey PRIMARY KEY (id);


--
-- Name: memory_edges memory_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_edges
    ADD CONSTRAINT memory_edges_pkey PRIMARY KEY (id);


--
-- Name: memory_entries memory_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_entries
    ADD CONSTRAINT memory_entries_pkey PRIMARY KEY (id);


--
-- Name: model_pricing model_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_pricing
    ADD CONSTRAINT model_pricing_pkey PRIMARY KEY (id);


--
-- Name: organization_audit_logs organization_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit_logs
    ADD CONSTRAINT organization_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: organization_node_skills organization_node_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_node_skills
    ADD CONSTRAINT organization_node_skills_pkey PRIMARY KEY (organization_node_id, skill_id);


--
-- Name: organization_nodes organization_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_nodes
    ADD CONSTRAINT organization_nodes_pkey PRIMARY KEY (id);


--
-- Name: platform_department_audit_logs platform_department_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_department_audit_logs
    ADD CONSTRAINT platform_department_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: platform_departments platform_departments_director_marketplace_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_departments
    ADD CONSTRAINT platform_departments_director_marketplace_agent_id_key UNIQUE (director_marketplace_agent_id);


--
-- Name: platform_departments platform_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_departments
    ADD CONSTRAINT platform_departments_pkey PRIMARY KEY (id);


--
-- Name: platform_departments platform_departments_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_departments
    ADD CONSTRAINT platform_departments_slug_key UNIQUE (slug);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: room_members room_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_members
    ADD CONSTRAINT room_members_pkey PRIMARY KEY (id);


--
-- Name: routes routes_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_path_key UNIQUE (path);


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);


--
-- Name: skill_artifacts skill_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_artifacts
    ADD CONSTRAINT skill_artifacts_pkey PRIMARY KEY (id);


--
-- Name: skill_audit_logs skill_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_audit_logs
    ADD CONSTRAINT skill_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: skill_execution_logs skill_execution_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_execution_logs
    ADD CONSTRAINT skill_execution_logs_pkey PRIMARY KEY (id);


--
-- Name: skill_mcp_tool_bindings skill_mcp_tool_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mcp_tool_bindings
    ADD CONSTRAINT skill_mcp_tool_bindings_pkey PRIMARY KEY (id);


--
-- Name: skill_mcp_tool_bindings skill_mcp_tool_bindings_skill_id_mcp_tool_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mcp_tool_bindings
    ADD CONSTRAINT skill_mcp_tool_bindings_skill_id_mcp_tool_id_key UNIQUE (skill_id, mcp_tool_id);


--
-- Name: skill_revisions skill_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_revisions
    ADD CONSTRAINT skill_revisions_pkey PRIMARY KEY (id);


--
-- Name: skill_versions skill_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_versions
    ADD CONSTRAINT skill_versions_pkey PRIMARY KEY (id);


--
-- Name: skill_versions skill_versions_skill_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_versions
    ADD CONSTRAINT skill_versions_skill_id_version_key UNIQUE (skill_id, version);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: supervisor_lessons supervisor_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisor_lessons
    ADD CONSTRAINT supervisor_lessons_pkey PRIMARY KEY (id);


--
-- Name: task_assignments task_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_pkey PRIMARY KEY (id);


--
-- Name: task_dependencies task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (id);


--
-- Name: task_execution_logs task_execution_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_execution_logs
    ADD CONSTRAINT task_execution_logs_pkey PRIMARY KEY (id);


--
-- Name: task_runs task_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: template_agent_mappings template_agent_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_agent_mappings
    ADD CONSTRAINT template_agent_mappings_pkey PRIMARY KEY (id);


--
-- Name: template_contents template_contents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_contents
    ADD CONSTRAINT template_contents_pkey PRIMARY KEY (template_id);


--
-- Name: chat_messages uq_chat_messages_room_seq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT uq_chat_messages_room_seq UNIQUE (room_id, seq);


--
-- Name: company_marketplace_agent_key_assignments uq_company_marketplace_agent; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_marketplace_agent_key_assignments
    ADD CONSTRAINT uq_company_marketplace_agent UNIQUE (company_id, marketplace_agent_id);


--
-- Name: company_snapshots uq_company_snapshots_company_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_snapshots
    ADD CONSTRAINT uq_company_snapshots_company_version UNIQUE (company_id, version);


--
-- Name: company_templates uq_company_templates_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_templates
    ADD CONSTRAINT uq_company_templates_slug UNIQUE (slug);


--
-- Name: llm_key_daily_usage uq_llm_key_daily_usage; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_key_daily_usage
    ADD CONSTRAINT uq_llm_key_daily_usage UNIQUE (llm_key_id, usage_date);


--
-- Name: llm_keys uq_llm_keys_provider_model_alias; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_keys
    ADD CONSTRAINT uq_llm_keys_provider_model_alias UNIQUE (provider, model_name, key_alias);


--
-- Name: llm_models uq_llm_models_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_models
    ADD CONSTRAINT uq_llm_models_unique UNIQUE (provider_code, model_name, model_type);


--
-- Name: marketplace_agent_key_bindings uq_marketplace_agent_key_bindings_agent_layer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_key_bindings
    ADD CONSTRAINT uq_marketplace_agent_key_bindings_agent_layer_key UNIQUE (marketplace_agent_id, ceo_layer, llm_key_id);


--
-- Name: marketplace_agent_key_bindings uq_marketplace_agent_key_bindings_llm_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_key_bindings
    ADD CONSTRAINT uq_marketplace_agent_key_bindings_llm_key UNIQUE (llm_key_id);


--
-- Name: marketplace_agents uq_marketplace_agents_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agents
    ADD CONSTRAINT uq_marketplace_agents_slug UNIQUE (slug);


--
-- Name: memory_collections uq_memory_collections_company_namespace; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_collections
    ADD CONSTRAINT uq_memory_collections_company_namespace UNIQUE (company_id, namespace);


--
-- Name: memory_edges uq_memory_edges_company_from_to_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_edges
    ADD CONSTRAINT uq_memory_edges_company_from_to_type UNIQUE (company_id, from_entry_id, to_entry_id, edge_type);


--
-- Name: room_members uq_room_members_active; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_members
    ADD CONSTRAINT uq_room_members_active UNIQUE (room_id, member_type, member_id);


--
-- Name: skill_revisions uq_skill_revision_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_revisions
    ADD CONSTRAINT uq_skill_revision_version UNIQUE (skill_id, version);


--
-- Name: task_dependencies uq_task_dep; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT uq_task_dep UNIQUE (company_id, task_id, depends_on_task_id);


--
-- Name: template_agent_mappings uq_template_agent; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_agent_mappings
    ADD CONSTRAINT uq_template_agent UNIQUE (template_id, marketplace_agent_id);


--
-- Name: IDX_oauth_accounts_provider_providerUserId; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_oauth_accounts_provider_providerUserId" ON public.oauth_accounts USING btree (provider, "providerUserId");


--
-- Name: IDX_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_users_email" ON public.users USING btree (email) WHERE ("deletedAt" IS NULL);


--
-- Name: IDX_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_users_username" ON public.users USING btree (username) WHERE ("deletedAt" IS NULL);


--
-- Name: gin_marketplace_agents_department_roles; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gin_marketplace_agents_department_roles ON public.marketplace_agents USING gin (department_roles);


--
-- Name: idx_admin_alerts_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_alerts_agent_id ON public.admin_alerts USING btree (agent_id);


--
-- Name: idx_admin_alerts_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_alerts_company_id ON public.admin_alerts USING btree (company_id);


--
-- Name: idx_admin_alerts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_alerts_created_at ON public.admin_alerts USING btree (created_at);


--
-- Name: idx_admin_alerts_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_alerts_severity ON public.admin_alerts USING btree (severity);


--
-- Name: idx_admin_alerts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_alerts_status ON public.admin_alerts USING btree (status);


--
-- Name: idx_admin_alerts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_alerts_type ON public.admin_alerts USING btree (type);


--
-- Name: idx_agent_audit_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_audit_agent ON public.agent_audit_logs USING btree (company_id, agent_id);


--
-- Name: idx_agent_audit_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_audit_company_created ON public.agent_audit_logs USING btree (company_id, created_at);


--
-- Name: idx_agent_skills_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_skills_company ON public.agent_skills USING btree (company_id);


--
-- Name: idx_agent_skills_company_temporary_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_skills_company_temporary_expires ON public.agent_skills USING btree (company_id, expires_at) WHERE ((is_temporary = true) AND (expires_at IS NOT NULL));


--
-- Name: idx_agent_skills_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_skills_skill ON public.agent_skills USING btree (skill_id);


--
-- Name: idx_agent_skills_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_skills_source ON public.agent_skills USING btree (source);


--
-- Name: idx_agents_company_ceo_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agents_company_ceo_unique ON public.agents USING btree (company_id) WHERE ((role)::text = 'ceo'::text);


--
-- Name: idx_agents_company_hierarchy_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_company_hierarchy_version ON public.agents USING btree (company_id, hierarchy_version);


--
-- Name: idx_agents_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_company_id ON public.agents USING btree (company_id);


--
-- Name: idx_agents_company_llm_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_company_llm_key ON public.agents USING btree (company_id, llm_key_id) WHERE (llm_key_id IS NOT NULL);


--
-- Name: idx_agents_company_reports_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_company_reports_to ON public.agents USING btree (company_id, reports_to_agent_id);


--
-- Name: idx_agents_company_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_company_role ON public.agents USING btree (company_id, role);


--
-- Name: idx_agents_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_company_status ON public.agents USING btree (company_id, status);


--
-- Name: idx_agents_org_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agents_org_node ON public.agents USING btree (organization_node_id);


--
-- Name: idx_api_keys_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_expires_at ON public.api_keys USING btree (expires_at);


--
-- Name: idx_api_keys_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_is_active ON public.api_keys USING btree (is_active);


--
-- Name: idx_api_keys_key_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_key_id ON public.api_keys USING btree (key_id);


--
-- Name: idx_approval_audit_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_audit_company_created ON public.approval_audit_logs USING btree (company_id, created_at);


--
-- Name: idx_approval_exec_tokens_approval; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_exec_tokens_approval ON public.approval_execution_tokens USING btree (approval_request_id);


--
-- Name: idx_approval_exec_tokens_company_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_exec_tokens_company_expires ON public.approval_execution_tokens USING btree (company_id, expires_at);


--
-- Name: idx_approval_requests_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_requests_company_status ON public.approval_requests USING btree (company_id, status);


--
-- Name: idx_audit_logs_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_company_id ON public.audit_logs USING btree (company_id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_method_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_method_path ON public.audit_logs USING btree (method, path);


--
-- Name: idx_audit_logs_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_service ON public.audit_logs USING btree (service);


--
-- Name: idx_audit_logs_service_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_service_created ON public.audit_logs USING btree (service, created_at DESC);


--
-- Name: idx_audit_logs_status_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_status_code ON public.audit_logs USING btree (status_code);


--
-- Name: idx_audit_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_created ON public.audit_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_billing_balance_credits_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_balance_credits_company_created ON public.billing_balance_credits USING btree (company_id, created_at DESC);


--
-- Name: idx_billing_budget_accruals_company_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_budget_accruals_company_amount ON public.billing_budget_accruals USING btree (company_id, accrued_amount DESC);


--
-- Name: idx_billing_recharge_orders_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_recharge_orders_company_status ON public.billing_recharge_orders USING btree (company_id, status, created_at DESC);


--
-- Name: idx_billing_record_idempotency_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_record_idempotency_created ON public.billing_record_idempotency USING btree (created_at DESC);


--
-- Name: idx_billing_records_company_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_records_company_agent ON public.billing_records USING btree (company_id, agent_id, occurred_at DESC);


--
-- Name: idx_billing_records_company_llm_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_records_company_llm_key ON public.billing_records USING btree (company_id, llm_key_id, occurred_at DESC);


--
-- Name: idx_billing_records_company_nominal_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_records_company_nominal_occurred ON public.billing_records USING btree (company_id, is_nominal, occurred_at DESC);


--
-- Name: idx_billing_records_company_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_records_company_occurred ON public.billing_records USING btree (company_id, occurred_at DESC);


--
-- Name: idx_billing_records_company_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_records_company_task ON public.billing_records USING btree (company_id, task_id);


--
-- Name: idx_billing_records_company_usage_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_records_company_usage_date ON public.billing_records USING btree (company_id, usage_date DESC);


--
-- Name: idx_billing_records_llm_key_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_records_llm_key_occurred ON public.billing_records USING btree (llm_key_id, occurred_at DESC);


--
-- Name: idx_budgets_company_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_company_scope ON public.budgets USING btree (company_id, scope);


--
-- Name: idx_chat_messages_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_company_created ON public.chat_messages USING btree (company_id, created_at);


--
-- Name: idx_chat_messages_content_tsv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_content_tsv ON public.chat_messages USING gin (content_tsv);


--
-- Name: idx_chat_messages_memory_references_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_memory_references_gin ON public.chat_messages USING gin (memory_references jsonb_path_ops);


--
-- Name: idx_chat_messages_room_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_room_sender ON public.chat_messages USING btree (room_id, sender_type, sender_id);


--
-- Name: idx_chat_messages_room_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_room_seq ON public.chat_messages USING btree (room_id, seq);


--
-- Name: idx_chat_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_thread ON public.chat_messages USING btree (thread_id);


--
-- Name: idx_chat_rooms_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_rooms_company ON public.chat_rooms USING btree (company_id);


--
-- Name: idx_chat_rooms_main_per_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_chat_rooms_main_per_company ON public.chat_rooms USING btree (company_id) WHERE ((room_type)::text = 'main'::text);


--
-- Name: idx_chat_rooms_org_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_rooms_org_node ON public.chat_rooms USING btree (organization_node_id);


--
-- Name: idx_companies_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_created_by ON public.companies USING btree (created_by);


--
-- Name: idx_companies_industry_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_industry_code ON public.companies USING btree (industry_code);


--
-- Name: idx_companies_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_is_active ON public.companies USING btree (is_active);


--
-- Name: idx_companies_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_companies_slug_unique ON public.companies USING btree (slug);


--
-- Name: idx_company_ceo_layer_configs_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_ceo_layer_configs_company_id ON public.company_ceo_layer_configs USING btree (company_id);


--
-- Name: idx_company_marketplace_agent_assignments_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_marketplace_agent_assignments_company ON public.company_marketplace_agent_key_assignments USING btree (company_id);


--
-- Name: idx_company_memberships_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_memberships_active ON public.company_memberships USING btree (company_id, user_id, is_active);


--
-- Name: idx_company_memberships_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_memberships_company_id ON public.company_memberships USING btree (company_id);


--
-- Name: idx_company_memberships_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_memberships_user_id ON public.company_memberships USING btree (user_id);


--
-- Name: idx_company_mkt_assignment_preferred_llm_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_mkt_assignment_preferred_llm_key ON public.company_marketplace_agent_key_assignments USING btree (preferred_llm_key_id) WHERE (preferred_llm_key_id IS NOT NULL);


--
-- Name: idx_company_snapshots_company_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_snapshots_company_created_at ON public.company_snapshots USING btree (company_id, created_at DESC);


--
-- Name: idx_company_templates_industry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_templates_industry ON public.company_templates USING btree (industry) WHERE (is_published = true);


--
-- Name: idx_daily_agent_usage_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_agent_usage_company_date ON public.daily_agent_usage USING btree (company_id, usage_date);


--
-- Name: idx_daily_agent_usage_company_date_total_cost; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_agent_usage_company_date_total_cost ON public.daily_agent_usage USING btree (company_id, usage_date, total_cost DESC);


--
-- Name: idx_daily_agent_usage_date_total_cost; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_agent_usage_date_total_cost ON public.daily_agent_usage USING btree (usage_date, total_cost DESC);


--
-- Name: idx_discussion_threads_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discussion_threads_company ON public.discussion_threads USING btree (company_id);


--
-- Name: idx_discussion_threads_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discussion_threads_room ON public.discussion_threads USING btree (room_id);


--
-- Name: idx_event_idempotency_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_idempotency_company_created ON public.event_idempotency_keys USING btree (company_id, created_at DESC);


--
-- Name: idx_llm_key_daily_usage_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_key_daily_usage_date ON public.llm_key_daily_usage USING btree (usage_date, used_tokens DESC);


--
-- Name: idx_llm_keys_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_keys_is_active ON public.llm_keys USING btree (is_active);


--
-- Name: idx_llm_keys_llm_model_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_keys_llm_model_id ON public.llm_keys USING btree (llm_model_id);


--
-- Name: idx_llm_keys_provider_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_keys_provider_model ON public.llm_keys USING btree (provider, model_name);


--
-- Name: idx_llm_models_provider_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_models_provider_type ON public.llm_models USING btree (provider_code, model_type);


--
-- Name: idx_llm_providers_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_providers_kind ON public.llm_providers USING btree (kind);


--
-- Name: idx_marketplace_agent_key_bindings_agent_layer_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_agent_key_bindings_agent_layer_sort ON public.marketplace_agent_key_bindings USING btree (marketplace_agent_id, ceo_layer, sort_order);


--
-- Name: idx_marketplace_agent_subscriptions_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_agent_subscriptions_company_status ON public.marketplace_agent_subscriptions USING btree (company_id, status);


--
-- Name: idx_marketplace_agents_bound_model_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_agents_bound_model_name ON public.marketplace_agents USING btree (bound_model_name) WHERE (bound_model_name IS NOT NULL);


-- Name: idx_marketplace_agents_is_published_agent_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_agents_is_published_agent_category ON public.marketplace_agents USING btree (is_published, agent_category);


--
-- Name: idx_marketplace_agents_agent_category_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_agents_agent_category_updated_at ON public.marketplace_agents USING btree (agent_category, updated_at DESC);


--
-- Name: idx_marketplace_agents_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_agents_published ON public.marketplace_agents USING btree (is_published);


--
-- Name: idx_marketplace_agents_skill_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_agents_skill_tags ON public.marketplace_agents USING gin (skill_tags);


--
-- Name: idx_marketplace_hire_requests_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_hire_requests_company_created ON public.marketplace_hire_requests USING btree (company_id, created_at DESC);


--
-- Name: idx_marketplace_hire_requests_company_employment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_hire_requests_company_employment ON public.marketplace_hire_requests USING btree (company_id, employment_type, created_at DESC);


--
-- Name: idx_marketplace_hire_requests_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_hire_requests_company_status ON public.marketplace_hire_requests USING btree (company_id, status);


--
-- Name: idx_memory_collections_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_collections_company ON public.memory_collections USING btree (company_id);


--
-- Name: idx_memory_edges_company_type_valid_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_edges_company_type_valid_from ON public.memory_edges USING btree (company_id, edge_type, valid_from DESC);


--
-- Name: idx_memory_edges_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_edges_metadata_gin ON public.memory_edges USING gin (metadata jsonb_path_ops);


--
-- Name: idx_memory_entries_company_coll_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_entries_company_coll_created ON public.memory_entries USING btree (company_id, collection_id, created_at DESC);


--
-- Name: idx_memory_entries_company_coll_source_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_entries_company_coll_source_created ON public.memory_entries USING btree (company_id, collection_id, source_type, created_at DESC);


--
-- Name: idx_memory_entries_content_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_entries_content_search ON public.memory_entries USING gin (content_search);


--
-- Name: idx_memory_entries_cycle_depth; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_entries_cycle_depth ON public.memory_entries USING btree (company_id, cycle_depth, created_at DESC);


--
-- Name: idx_memory_entries_importance_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_entries_importance_created ON public.memory_entries USING btree (company_id, importance_score DESC, created_at DESC);


--
-- Name: idx_memory_entries_lineage_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_entries_lineage_hash ON public.memory_entries USING btree (company_id, lineage_hash) WHERE (lineage_hash IS NOT NULL);


--
-- Name: idx_memory_entries_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_entries_metadata_gin ON public.memory_entries USING gin (metadata jsonb_path_ops);


--
-- Name: idx_memory_entries_retention_decay; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_entries_retention_decay ON public.memory_entries USING btree (company_id, retention_class, decay_at);


--
-- Name: idx_memory_entries_sensitive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memory_entries_sensitive ON public.memory_entries USING btree (company_id, is_sensitive) WHERE (is_sensitive = true);


--
-- Name: idx_model_pricing_company_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_model_pricing_company_model ON public.model_pricing USING btree (company_id, model_name, effective_from DESC);


--
-- Name: idx_org_audit_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_audit_company_created ON public.organization_audit_logs USING btree (company_id, created_at);


--
-- Name: idx_org_audit_company_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_audit_company_node ON public.organization_audit_logs USING btree (company_id, node_id);


--
-- Name: idx_org_audit_company_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_audit_company_user ON public.organization_audit_logs USING btree (company_id, user_id);


--
-- Name: idx_org_node_skills_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_node_skills_company ON public.organization_node_skills USING btree (company_id);


--
-- Name: idx_org_node_skills_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_node_skills_skill ON public.organization_node_skills USING btree (skill_id);


--
-- Name: idx_org_nodes_company_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_nodes_company_agent ON public.organization_nodes USING btree (company_id, agent_id);


--
-- Name: idx_org_nodes_company_agent_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_nodes_company_agent_unique ON public.organization_nodes USING btree (company_id, agent_id) WHERE (agent_id IS NOT NULL);


--
-- Name: idx_org_nodes_company_parent_agent_not_null; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_nodes_company_parent_agent_not_null ON public.organization_nodes USING btree (company_id, parent_id, agent_id) WHERE (agent_id IS NOT NULL);


--
-- Name: idx_org_nodes_company_parent_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_nodes_company_parent_order ON public.organization_nodes USING btree (company_id, parent_id, order_no);


--
-- Name: idx_org_nodes_company_parent_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_nodes_company_parent_type ON public.organization_nodes USING btree (company_id, parent_id, type);


--
-- Name: idx_org_nodes_company_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_nodes_company_type ON public.organization_nodes USING btree (company_id, type);


--
-- Name: idx_platform_departments_default_for_new_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_departments_default_for_new_company ON public.platform_departments USING btree (is_default_for_new_company);


--
-- Name: idx_platform_departments_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_departments_sort_order ON public.platform_departments USING btree (sort_order, display_name);


--
-- Name: idx_platform_dept_audit_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_dept_audit_dept ON public.platform_department_audit_logs USING btree (platform_department_id, created_at DESC);


--
-- Name: idx_room_members_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_members_company ON public.room_members USING btree (company_id);


--
-- Name: idx_room_members_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_members_room ON public.room_members USING btree (room_id);


--
-- Name: idx_routes_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_is_active ON public.routes USING btree (is_active);


--
-- Name: idx_routes_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_path ON public.routes USING btree (path);


--
-- Name: idx_routes_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_priority ON public.routes USING btree (priority DESC, path);


--
-- Name: idx_routes_rpc_pattern; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_rpc_pattern ON public.routes USING btree (rpc_pattern);


--
-- Name: idx_routes_transport; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_transport ON public.routes USING btree (transport);


--
-- Name: idx_skill_artifacts_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_artifacts_company_created ON public.skill_artifacts USING btree (company_id, created_at);


--
-- Name: idx_skill_artifacts_skill_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_artifacts_skill_created ON public.skill_artifacts USING btree (skill_id, created_at);


--
-- Name: idx_skill_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_audit_logs_action ON public.skill_audit_logs USING btree (action_type);


--
-- Name: idx_skill_audit_logs_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_audit_logs_company_created ON public.skill_audit_logs USING btree (company_id, created_at DESC);


--
-- Name: idx_skill_audit_logs_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_audit_logs_skill ON public.skill_audit_logs USING btree (skill_id);


--
-- Name: idx_skill_exec_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_exec_agent ON public.skill_execution_logs USING btree (company_id, agent_id);


--
-- Name: idx_skill_exec_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_exec_company_created ON public.skill_execution_logs USING btree (company_id, created_at DESC);


--
-- Name: idx_skill_mcp_bindings_company_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_mcp_bindings_company_skill ON public.skill_mcp_tool_bindings USING btree (company_id, skill_id);


--
-- Name: idx_skill_revisions_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_revisions_company_created ON public.skill_revisions USING btree (company_id, created_at);


--
-- Name: idx_skill_revisions_review_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_revisions_review_status ON public.skill_revisions USING btree (review_status);


--
-- Name: idx_skill_revisions_skill_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_revisions_skill_status ON public.skill_revisions USING btree (skill_id, status);


--
-- Name: idx_skill_versions_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_versions_skill ON public.skill_versions USING btree (skill_id, version DESC);


--
-- Name: idx_skills_approval_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skills_approval_status ON public.skills USING btree (approval_status);


--
-- Name: idx_skills_company_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skills_company_enabled ON public.skills USING btree (company_id, is_enabled);


--
-- Name: idx_skills_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skills_company_id ON public.skills USING btree (company_id);


--
-- Name: idx_skills_company_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_skills_company_name ON public.skills USING btree (company_id, name) WHERE (company_id IS NOT NULL);


--
-- Name: idx_skills_global_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_skills_global_name ON public.skills USING btree (name) WHERE (company_id IS NULL);


--
-- Name: idx_skills_global_name_one_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_skills_global_name_one_latest ON public.skills USING btree (name) WHERE ((company_id IS NULL) AND (is_latest = true));


--
-- Name: idx_skills_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skills_name ON public.skills USING btree (name);


--
-- Name: idx_supervisor_lessons_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supervisor_lessons_company_created ON public.supervisor_lessons USING btree (company_id, created_at DESC);


--
-- Name: idx_supervisor_lessons_company_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supervisor_lessons_company_hash ON public.supervisor_lessons USING btree (company_id, failure_signature_hash);


--
-- Name: idx_task_assignments_company_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_assignments_company_task ON public.task_assignments USING btree (company_id, task_id);


--
-- Name: idx_task_dependencies_company_depends; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_dependencies_company_depends ON public.task_dependencies USING btree (company_id, depends_on_task_id);


--
-- Name: idx_task_dependencies_company_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_dependencies_company_task ON public.task_dependencies USING btree (company_id, task_id);


--
-- Name: idx_task_execution_logs_company_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_execution_logs_company_agent ON public.task_execution_logs USING btree (company_id, agent_id);


--
-- Name: idx_task_execution_logs_company_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_execution_logs_company_task ON public.task_execution_logs USING btree (company_id, task_id, created_at DESC);


--
-- Name: idx_task_execution_logs_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_execution_logs_run ON public.task_execution_logs USING btree (company_id, run_id, created_at DESC);


--
-- Name: idx_task_runs_approval_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_runs_approval_request ON public.task_runs USING btree (approval_request_id) WHERE (approval_request_id IS NOT NULL);


--
-- Name: idx_task_runs_company_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_runs_company_started ON public.task_runs USING btree (company_id, started_at DESC);


--
-- Name: idx_task_runs_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_runs_company_status ON public.task_runs USING btree (company_id, status);


--
-- Name: idx_tasks_company_approval_flow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_company_approval_flow ON public.tasks USING btree (company_id, approval_flow_id) WHERE (approval_flow_id IS NOT NULL);


--
-- Name: idx_tasks_company_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_company_assignee ON public.tasks USING btree (company_id, assignee_type, assignee_id);


--
-- Name: idx_tasks_company_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_company_parent ON public.tasks USING btree (company_id, parent_id);


--
-- Name: idx_tasks_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_company_status ON public.tasks USING btree (company_id, status);


--
-- Name: idx_tasks_company_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_company_updated ON public.tasks USING btree (company_id, updated_at DESC);


--
-- Name: idx_template_agent_mappings_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_agent_mappings_template ON public.template_agent_mappings USING btree (template_id);


--
-- Name: uq_billing_budget_accruals_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_billing_budget_accruals_scope ON public.billing_budget_accruals USING btree (company_id, scope, department_id, agent_id);


--
-- Name: uq_billing_recharge_orders_company_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_billing_recharge_orders_company_idempotency ON public.billing_recharge_orders USING btree (company_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_billing_records_daily_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_billing_records_daily_agent ON public.billing_records USING btree (company_id, agent_id, usage_date, record_type, is_nominal) WHERE (agent_id IS NOT NULL);


--
-- Name: uq_budgets_company_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_budgets_company_agent ON public.budgets USING btree (company_id, agent_id) WHERE (((scope)::text = 'agent'::text) AND (agent_id IS NOT NULL));


--
-- Name: uq_budgets_company_department; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_budgets_company_department ON public.budgets USING btree (company_id, department_id) WHERE (((scope)::text = 'department'::text) AND (department_id IS NOT NULL));


--
-- Name: uq_budgets_company_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_budgets_company_scope ON public.budgets USING btree (company_id) WHERE ((scope)::text = 'company'::text);


--
-- Name: uq_daily_agent_usage_company_agent_date; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_daily_agent_usage_company_agent_date ON public.daily_agent_usage USING btree (company_id, agent_id, usage_date);


--
-- Name: uq_event_idempotency_company_event_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_event_idempotency_company_event_key ON public.event_idempotency_keys USING btree (company_id, event_type, idempotency_key);


--
-- Name: uq_llm_keys_model_alias; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_llm_keys_model_alias ON public.llm_keys USING btree (llm_model_id, key_alias) WHERE (llm_model_id IS NOT NULL);


--
-- Name: uq_marketplace_agent_subscriptions_active_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_marketplace_agent_subscriptions_active_slot ON public.marketplace_agent_subscriptions USING btree (company_id, marketplace_agent_id, organization_node_id) WHERE ((status)::text = 'active'::text);


--
-- Name: uq_marketplace_hire_pending_triple; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_marketplace_hire_pending_triple ON public.marketplace_hire_requests USING btree (company_id, marketplace_agent_id, organization_node_id) WHERE ((status)::text = 'pending'::text);


--
-- Name: uq_memory_entries_chat_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_memory_entries_chat_dedup ON public.memory_entries USING btree (company_id, source_ref) WHERE (((source_type)::text = 'chat'::text) AND (source_ref IS NOT NULL));


--
-- Name: uq_model_pricing_platform_model_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_model_pricing_platform_model_effective ON public.model_pricing USING btree (model_name, effective_from) WHERE (company_id IS NULL);


--
-- Name: api_keys update_api_keys_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: routes update_routes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: oauth_accounts FK_oauth_accounts_userId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_accounts
    ADD CONSTRAINT "FK_oauth_accounts_userId" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: agent_audit_logs agent_audit_logs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_audit_logs
    ADD CONSTRAINT agent_audit_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_audit_logs agent_audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_audit_logs
    ADD CONSTRAINT agent_audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agent_skills agent_skills_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_skills
    ADD CONSTRAINT agent_skills_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_skills agent_skills_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_skills
    ADD CONSTRAINT agent_skills_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agent_skills agent_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_skills
    ADD CONSTRAINT agent_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: agents agents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agents agents_llm_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_llm_key_id_fkey FOREIGN KEY (llm_key_id) REFERENCES public.llm_keys(id) ON DELETE SET NULL;


--
-- Name: agents agents_organization_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_organization_node_id_fkey FOREIGN KEY (organization_node_id) REFERENCES public.organization_nodes(id) ON DELETE SET NULL;


--
-- Name: approval_audit_logs approval_audit_logs_approval_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_audit_logs
    ADD CONSTRAINT approval_audit_logs_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES public.approval_requests(id) ON DELETE CASCADE;


--
-- Name: approval_audit_logs approval_audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_audit_logs
    ADD CONSTRAINT approval_audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: approval_execution_tokens approval_execution_tokens_approval_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_execution_tokens
    ADD CONSTRAINT approval_execution_tokens_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES public.approval_requests(id) ON DELETE CASCADE;


--
-- Name: approval_execution_tokens approval_execution_tokens_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_execution_tokens
    ADD CONSTRAINT approval_execution_tokens_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: approval_requests approval_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: billing_balance_credits billing_balance_credits_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_balance_credits
    ADD CONSTRAINT billing_balance_credits_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.budgets(id) ON DELETE RESTRICT;


--
-- Name: billing_balance_credits billing_balance_credits_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_balance_credits
    ADD CONSTRAINT billing_balance_credits_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: billing_balance_credits billing_balance_credits_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_balance_credits
    ADD CONSTRAINT billing_balance_credits_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.billing_recharge_orders(id) ON DELETE RESTRICT;


--
-- Name: billing_budget_accruals billing_budget_accruals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_budget_accruals
    ADD CONSTRAINT billing_budget_accruals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: billing_recharge_orders billing_recharge_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_recharge_orders
    ADD CONSTRAINT billing_recharge_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: billing_recharge_orders billing_recharge_orders_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_recharge_orders
    ADD CONSTRAINT billing_recharge_orders_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: billing_recharge_orders billing_recharge_orders_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_recharge_orders
    ADD CONSTRAINT billing_recharge_orders_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: billing_record_idempotency billing_record_idempotency_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_record_idempotency
    ADD CONSTRAINT billing_record_idempotency_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: billing_records billing_records_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_records
    ADD CONSTRAINT billing_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: billing_records billing_records_llm_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_records
    ADD CONSTRAINT billing_records_llm_key_id_fkey FOREIGN KEY (llm_key_id) REFERENCES public.llm_keys(id) ON DELETE SET NULL;


--
-- Name: billing_settings billing_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_settings
    ADD CONSTRAINT billing_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: budgets budgets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.discussion_threads(id) ON DELETE SET NULL;


--
-- Name: chat_rooms chat_rooms_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: chat_rooms chat_rooms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chat_rooms chat_rooms_organization_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_organization_node_id_fkey FOREIGN KEY (organization_node_id) REFERENCES public.organization_nodes(id) ON DELETE SET NULL;


--
-- Name: company_ceo_layer_configs company_ceo_layer_configs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_ceo_layer_configs
    ADD CONSTRAINT company_ceo_layer_configs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_embedding_settings company_embedding_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_embedding_settings
    ADD CONSTRAINT company_embedding_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_embedding_settings company_embedding_settings_default_embedding_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_embedding_settings
    ADD CONSTRAINT company_embedding_settings_default_embedding_model_id_fkey FOREIGN KEY (default_embedding_model_id) REFERENCES public.llm_models(id);


--
-- Name: company_marketplace_agent_key_assignments company_marketplace_agent_key_assignm_marketplace_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_marketplace_agent_key_assignments
    ADD CONSTRAINT company_marketplace_agent_key_assignm_marketplace_agent_id_fkey FOREIGN KEY (marketplace_agent_id) REFERENCES public.marketplace_agents(id) ON DELETE CASCADE;


--
-- Name: company_marketplace_agent_key_assignments company_marketplace_agent_key_assignm_preferred_llm_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_marketplace_agent_key_assignments
    ADD CONSTRAINT company_marketplace_agent_key_assignm_preferred_llm_key_id_fkey FOREIGN KEY (preferred_llm_key_id) REFERENCES public.llm_keys(id) ON DELETE SET NULL;


--
-- Name: company_marketplace_agent_key_assignments company_marketplace_agent_key_assignme_assigned_llm_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_marketplace_agent_key_assignments
    ADD CONSTRAINT company_marketplace_agent_key_assignme_assigned_llm_key_id_fkey FOREIGN KEY (assigned_llm_key_id) REFERENCES public.llm_keys(id) ON DELETE RESTRICT;


--
-- Name: company_marketplace_agent_key_assignments company_marketplace_agent_key_assignments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_marketplace_agent_key_assignments
    ADD CONSTRAINT company_marketplace_agent_key_assignments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_memberships company_memberships_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_memberships company_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: company_runtime_preferences company_runtime_preferences_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_runtime_preferences
    ADD CONSTRAINT company_runtime_preferences_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_snapshots company_snapshots_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_snapshots
    ADD CONSTRAINT company_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: discussion_threads discussion_threads_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discussion_threads
    ADD CONSTRAINT discussion_threads_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: discussion_threads discussion_threads_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discussion_threads
    ADD CONSTRAINT discussion_threads_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: event_idempotency_keys event_idempotency_keys_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_idempotency_keys
    ADD CONSTRAINT event_idempotency_keys_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_marketplace_agent_key_assignments fk_company_assignment_embedding_model_to_llm_models; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_marketplace_agent_key_assignments
    ADD CONSTRAINT fk_company_assignment_embedding_model_to_llm_models FOREIGN KEY (assigned_embedding_model_id) REFERENCES public.llm_models(id) ON DELETE SET NULL;


--
-- Name: llm_keys fk_llm_keys_llm_model_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_keys
    ADD CONSTRAINT fk_llm_keys_llm_model_id FOREIGN KEY (llm_model_id) REFERENCES public.llm_models(id) ON DELETE SET NULL;


--
-- Name: marketplace_agent_key_bindings fk_marketplace_binding_embedding_model_to_llm_models; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_key_bindings
    ADD CONSTRAINT fk_marketplace_binding_embedding_model_to_llm_models FOREIGN KEY (embedding_model_id) REFERENCES public.llm_models(id) ON DELETE SET NULL;


--
-- Name: organization_nodes fk_organization_nodes_agent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_nodes
    ADD CONSTRAINT fk_organization_nodes_agent FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: platform_departments fk_platform_departments_director_agent_set_null; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_departments
    ADD CONSTRAINT fk_platform_departments_director_agent_set_null FOREIGN KEY (director_marketplace_agent_id) REFERENCES public.marketplace_agents(id) ON DELETE SET NULL;


--
-- Name: supervisor_lessons fk_supervisor_lessons_run; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisor_lessons
    ADD CONSTRAINT fk_supervisor_lessons_run FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE CASCADE;


--
-- Name: llm_key_daily_usage llm_key_daily_usage_llm_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_key_daily_usage
    ADD CONSTRAINT llm_key_daily_usage_llm_key_id_fkey FOREIGN KEY (llm_key_id) REFERENCES public.llm_keys(id) ON DELETE CASCADE;


--
-- Name: marketplace_agent_key_bindings marketplace_agent_key_bindings_llm_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_key_bindings
    ADD CONSTRAINT marketplace_agent_key_bindings_llm_key_id_fkey FOREIGN KEY (llm_key_id) REFERENCES public.llm_keys(id) ON DELETE RESTRICT;


--
-- Name: marketplace_agent_key_bindings marketplace_agent_key_bindings_marketplace_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_key_bindings
    ADD CONSTRAINT marketplace_agent_key_bindings_marketplace_agent_id_fkey FOREIGN KEY (marketplace_agent_id) REFERENCES public.marketplace_agents(id) ON DELETE CASCADE;


--
-- Name: marketplace_agent_subscriptions marketplace_agent_subscriptions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_subscriptions
    ADD CONSTRAINT marketplace_agent_subscriptions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: marketplace_agent_subscriptions marketplace_agent_subscriptions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_subscriptions
    ADD CONSTRAINT marketplace_agent_subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: marketplace_agent_subscriptions marketplace_agent_subscriptions_marketplace_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_subscriptions
    ADD CONSTRAINT marketplace_agent_subscriptions_marketplace_agent_id_fkey FOREIGN KEY (marketplace_agent_id) REFERENCES public.marketplace_agents(id) ON DELETE RESTRICT;


--
-- Name: marketplace_agent_subscriptions marketplace_agent_subscriptions_organization_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_subscriptions
    ADD CONSTRAINT marketplace_agent_subscriptions_organization_node_id_fkey FOREIGN KEY (organization_node_id) REFERENCES public.organization_nodes(id) ON DELETE SET NULL;


--
-- Name: marketplace_agent_subscriptions marketplace_agent_subscriptions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_agent_subscriptions
    ADD CONSTRAINT marketplace_agent_subscriptions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: marketplace_hire_requests marketplace_hire_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_hire_requests
    ADD CONSTRAINT marketplace_hire_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: marketplace_hire_requests marketplace_hire_requests_marketplace_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_hire_requests
    ADD CONSTRAINT marketplace_hire_requests_marketplace_agent_id_fkey FOREIGN KEY (marketplace_agent_id) REFERENCES public.marketplace_agents(id) ON DELETE RESTRICT;


--
-- Name: marketplace_hire_requests marketplace_hire_requests_organization_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_hire_requests
    ADD CONSTRAINT marketplace_hire_requests_organization_node_id_fkey FOREIGN KEY (organization_node_id) REFERENCES public.organization_nodes(id) ON DELETE CASCADE;


--
-- Name: marketplace_hire_requests marketplace_hire_requests_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_hire_requests
    ADD CONSTRAINT marketplace_hire_requests_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: marketplace_hire_requests marketplace_hire_requests_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_hire_requests
    ADD CONSTRAINT marketplace_hire_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: marketplace_hire_requests marketplace_hire_requests_result_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_hire_requests
    ADD CONSTRAINT marketplace_hire_requests_result_agent_id_fkey FOREIGN KEY (result_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: marketplace_hire_requests marketplace_hire_requests_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_hire_requests
    ADD CONSTRAINT marketplace_hire_requests_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: memory_collections memory_collections_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_collections
    ADD CONSTRAINT memory_collections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: memory_edges memory_edges_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_edges
    ADD CONSTRAINT memory_edges_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: memory_edges memory_edges_from_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_edges
    ADD CONSTRAINT memory_edges_from_entry_id_fkey FOREIGN KEY (from_entry_id) REFERENCES public.memory_entries(id) ON DELETE CASCADE;


--
-- Name: memory_edges memory_edges_to_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_edges
    ADD CONSTRAINT memory_edges_to_entry_id_fkey FOREIGN KEY (to_entry_id) REFERENCES public.memory_entries(id) ON DELETE SET NULL;


--
-- Name: memory_entries memory_entries_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_entries
    ADD CONSTRAINT memory_entries_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.memory_collections(id) ON DELETE CASCADE;


--
-- Name: memory_entries memory_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_entries
    ADD CONSTRAINT memory_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: model_pricing model_pricing_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_pricing
    ADD CONSTRAINT model_pricing_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: organization_audit_logs organization_audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit_logs
    ADD CONSTRAINT organization_audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: organization_audit_logs organization_audit_logs_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit_logs
    ADD CONSTRAINT organization_audit_logs_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.organization_nodes(id) ON DELETE CASCADE;


--
-- Name: organization_node_skills organization_node_skills_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_node_skills
    ADD CONSTRAINT organization_node_skills_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: organization_node_skills organization_node_skills_organization_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_node_skills
    ADD CONSTRAINT organization_node_skills_organization_node_id_fkey FOREIGN KEY (organization_node_id) REFERENCES public.organization_nodes(id) ON DELETE CASCADE;


--
-- Name: organization_node_skills organization_node_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_node_skills
    ADD CONSTRAINT organization_node_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: organization_nodes organization_nodes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_nodes
    ADD CONSTRAINT organization_nodes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: organization_nodes organization_nodes_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_nodes
    ADD CONSTRAINT organization_nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.organization_nodes(id) ON DELETE SET NULL;


--
-- Name: platform_department_audit_logs platform_department_audit_log_previous_marketplace_agent_i_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_department_audit_logs
    ADD CONSTRAINT platform_department_audit_log_previous_marketplace_agent_i_fkey FOREIGN KEY (previous_marketplace_agent_id) REFERENCES public.marketplace_agents(id) ON DELETE SET NULL;


--
-- Name: platform_department_audit_logs platform_department_audit_logs_new_marketplace_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_department_audit_logs
    ADD CONSTRAINT platform_department_audit_logs_new_marketplace_agent_id_fkey FOREIGN KEY (new_marketplace_agent_id) REFERENCES public.marketplace_agents(id) ON DELETE SET NULL;


--
-- Name: platform_department_audit_logs platform_department_audit_logs_platform_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_department_audit_logs
    ADD CONSTRAINT platform_department_audit_logs_platform_department_id_fkey FOREIGN KEY (platform_department_id) REFERENCES public.platform_departments(id) ON DELETE CASCADE;


--
-- Name: room_members room_members_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_members
    ADD CONSTRAINT room_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: room_members room_members_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_members
    ADD CONSTRAINT room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: skill_artifacts skill_artifacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_artifacts
    ADD CONSTRAINT skill_artifacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: skill_artifacts skill_artifacts_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_artifacts
    ADD CONSTRAINT skill_artifacts_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE SET NULL;


--
-- Name: skill_audit_logs skill_audit_logs_changed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_audit_logs
    ADD CONSTRAINT skill_audit_logs_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: skill_audit_logs skill_audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_audit_logs
    ADD CONSTRAINT skill_audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: skill_audit_logs skill_audit_logs_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_audit_logs
    ADD CONSTRAINT skill_audit_logs_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE SET NULL;


--
-- Name: skill_execution_logs skill_execution_logs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_execution_logs
    ADD CONSTRAINT skill_execution_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: skill_execution_logs skill_execution_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_execution_logs
    ADD CONSTRAINT skill_execution_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: skill_execution_logs skill_execution_logs_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_execution_logs
    ADD CONSTRAINT skill_execution_logs_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE SET NULL;


--
-- Name: skill_mcp_tool_bindings skill_mcp_tool_bindings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mcp_tool_bindings
    ADD CONSTRAINT skill_mcp_tool_bindings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: skill_mcp_tool_bindings skill_mcp_tool_bindings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mcp_tool_bindings
    ADD CONSTRAINT skill_mcp_tool_bindings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: skill_mcp_tool_bindings skill_mcp_tool_bindings_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_mcp_tool_bindings
    ADD CONSTRAINT skill_mcp_tool_bindings_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_revisions skill_revisions_artifact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_revisions
    ADD CONSTRAINT skill_revisions_artifact_id_fkey FOREIGN KEY (artifact_id) REFERENCES public.skill_artifacts(id) ON DELETE SET NULL;


--
-- Name: skill_revisions skill_revisions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_revisions
    ADD CONSTRAINT skill_revisions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: skill_revisions skill_revisions_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_revisions
    ADD CONSTRAINT skill_revisions_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_versions skill_versions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_versions
    ADD CONSTRAINT skill_versions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: skill_versions skill_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_versions
    ADD CONSTRAINT skill_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: skill_versions skill_versions_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_versions
    ADD CONSTRAINT skill_versions_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skills skills_approval_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES public.approval_requests(id) ON DELETE SET NULL;


--
-- Name: skills skills_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: skills skills_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: skills skills_current_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES public.skill_revisions(id) ON DELETE SET NULL;


--
-- Name: skills skills_published_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_published_revision_id_fkey FOREIGN KEY (published_revision_id) REFERENCES public.skill_revisions(id) ON DELETE SET NULL;


--
-- Name: skills skills_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: supervisor_lessons supervisor_lessons_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisor_lessons
    ADD CONSTRAINT supervisor_lessons_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: task_assignments task_assignments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: task_assignments task_assignments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_depends_on_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_execution_logs task_execution_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_execution_logs
    ADD CONSTRAINT task_execution_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: task_execution_logs task_execution_logs_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_execution_logs
    ADD CONSTRAINT task_execution_logs_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.task_runs(id) ON DELETE SET NULL;


--
-- Name: task_execution_logs task_execution_logs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_execution_logs
    ADD CONSTRAINT task_execution_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_runs task_runs_approval_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_approval_request_id_fkey FOREIGN KEY (approval_request_id) REFERENCES public.approval_requests(id) ON DELETE SET NULL;


--
-- Name: task_runs task_runs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_runs
    ADD CONSTRAINT task_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: template_agent_mappings template_agent_mappings_marketplace_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_agent_mappings
    ADD CONSTRAINT template_agent_mappings_marketplace_agent_id_fkey FOREIGN KEY (marketplace_agent_id) REFERENCES public.marketplace_agents(id) ON DELETE CASCADE;


--
-- Name: template_agent_mappings template_agent_mappings_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_agent_mappings
    ADD CONSTRAINT template_agent_mappings_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.company_templates(id) ON DELETE CASCADE;


--
-- Name: template_contents template_contents_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_contents
    ADD CONSTRAINT template_contents_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.company_templates(id) ON DELETE CASCADE;


--
-- Name: agent_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_execution_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_execution_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_balance_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_balance_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_budget_accruals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_budget_accruals ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_recharge_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_recharge_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_record_idempotency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_record_idempotency ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: budgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_ceo_layer_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_ceo_layer_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_records company_isolation_insert_billing_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_insert_billing_records ON public.billing_records FOR INSERT WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: agent_audit_logs company_isolation_on_agent_audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_agent_audit_logs ON public.agent_audit_logs USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: agent_skills company_isolation_on_agent_skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_agent_skills ON public.agent_skills USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: agents company_isolation_on_agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_agents ON public.agents USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: approval_audit_logs company_isolation_on_approval_audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_approval_audit_logs ON public.approval_audit_logs USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: approval_execution_tokens company_isolation_on_approval_execution_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_approval_execution_tokens ON public.approval_execution_tokens USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: approval_requests company_isolation_on_approval_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_approval_requests ON public.approval_requests USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: billing_balance_credits company_isolation_on_billing_balance_credits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_billing_balance_credits ON public.billing_balance_credits USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: billing_budget_accruals company_isolation_on_billing_budget_accruals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_billing_budget_accruals ON public.billing_budget_accruals USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: billing_recharge_orders company_isolation_on_billing_recharge_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_billing_recharge_orders ON public.billing_recharge_orders USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: billing_record_idempotency company_isolation_on_billing_record_idempotency; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_billing_record_idempotency ON public.billing_record_idempotency USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: billing_settings company_isolation_on_billing_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_billing_settings ON public.billing_settings USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: budgets company_isolation_on_budgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_budgets ON public.budgets USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: chat_messages company_isolation_on_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_chat_messages ON public.chat_messages USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: chat_rooms company_isolation_on_chat_rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_chat_rooms ON public.chat_rooms USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: companies company_isolation_on_companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_companies ON public.companies USING (((id = (current_setting('app.current_tenant'::text, true))::uuid) OR (EXISTS ( SELECT 1
   FROM public.company_memberships m
  WHERE ((m.company_id = companies.id) AND (m.user_id = (current_setting('app.membership_listing_user'::text, true))::uuid) AND (m.is_active = true)))))) WITH CHECK ((id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: company_ceo_layer_configs company_isolation_on_company_ceo_layer_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_company_ceo_layer_configs ON public.company_ceo_layer_configs USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: company_marketplace_agent_key_assignments company_isolation_on_company_marketplace_agent_key_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_company_marketplace_agent_key_assignments ON public.company_marketplace_agent_key_assignments USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: company_runtime_preferences company_isolation_on_company_runtime_preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_company_runtime_preferences ON public.company_runtime_preferences USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: company_snapshots company_isolation_on_company_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_company_snapshots ON public.company_snapshots USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: discussion_threads company_isolation_on_discussion_threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_discussion_threads ON public.discussion_threads USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: marketplace_agent_subscriptions company_isolation_on_marketplace_agent_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_marketplace_agent_subscriptions ON public.marketplace_agent_subscriptions USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: marketplace_hire_requests company_isolation_on_marketplace_hire_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_marketplace_hire_requests ON public.marketplace_hire_requests USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: company_memberships company_isolation_on_memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_memberships ON public.company_memberships USING (((company_id = (current_setting('app.current_tenant'::text, true))::uuid) OR (user_id = (current_setting('app.membership_listing_user'::text, true))::uuid))) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: memory_collections company_isolation_on_memory_collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_memory_collections ON public.memory_collections USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: memory_edges company_isolation_on_memory_edges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_memory_edges ON public.memory_edges USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: memory_entries company_isolation_on_memory_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_memory_entries ON public.memory_entries USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: organization_node_skills company_isolation_on_org_node_skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_org_node_skills ON public.organization_node_skills USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: organization_audit_logs company_isolation_on_organization_audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_organization_audit_logs ON public.organization_audit_logs USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: organization_nodes company_isolation_on_organization_nodes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_organization_nodes ON public.organization_nodes USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: room_members company_isolation_on_room_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_room_members ON public.room_members USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: skill_audit_logs company_isolation_on_skill_audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_skill_audit_logs ON public.skill_audit_logs USING (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid))) WITH CHECK (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- Name: skill_execution_logs company_isolation_on_skill_execution_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_skill_execution_logs ON public.skill_execution_logs USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: skill_mcp_tool_bindings company_isolation_on_skill_mcp_tool_bindings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_skill_mcp_tool_bindings ON public.skill_mcp_tool_bindings USING (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid))) WITH CHECK (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- Name: skill_versions company_isolation_on_skill_versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_skill_versions ON public.skill_versions USING (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid))) WITH CHECK (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- Name: task_assignments company_isolation_on_task_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_task_assignments ON public.task_assignments USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: task_dependencies company_isolation_on_task_dependencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_task_dependencies ON public.task_dependencies USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: task_execution_logs company_isolation_on_task_execution_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_task_execution_logs ON public.task_execution_logs USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: task_runs company_isolation_on_task_runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_task_runs ON public.task_runs USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: tasks company_isolation_on_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_on_tasks ON public.tasks USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: billing_records company_isolation_select_billing_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_select_billing_records ON public.billing_records FOR SELECT USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: billing_records company_isolation_update_billing_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_update_billing_records ON public.billing_records FOR UPDATE USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: company_marketplace_agent_key_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_marketplace_agent_key_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: company_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: company_runtime_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_runtime_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: company_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: discussion_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discussion_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_agent_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_agent_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_hire_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_hire_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_collections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: model_pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.model_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: model_pricing model_pricing_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY model_pricing_delete ON public.model_pricing FOR DELETE USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: model_pricing model_pricing_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY model_pricing_insert ON public.model_pricing FOR INSERT WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: model_pricing model_pricing_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY model_pricing_select ON public.model_pricing FOR SELECT USING (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- Name: model_pricing model_pricing_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY model_pricing_update ON public.model_pricing FOR UPDATE USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: organization_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_node_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_node_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_nodes ENABLE ROW LEVEL SECURITY;

--
-- Name: room_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_artifacts ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_execution_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_execution_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_mcp_tool_bindings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_mcp_tool_bindings ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skill_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: supervisor_lessons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supervisor_lessons ENABLE ROW LEVEL SECURITY;

--
-- Name: supervisor_lessons supervisor_lessons_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supervisor_lessons_tenant_isolation ON public.supervisor_lessons USING ((company_id = (current_setting('app.current_tenant'::text, true))::uuid)) WITH CHECK ((company_id = (current_setting('app.current_tenant'::text, true))::uuid));


--
-- Name: task_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: task_execution_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_execution_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: task_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: skill_artifacts tenant_read_global_skill_artifacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_read_global_skill_artifacts ON public.skill_artifacts FOR SELECT USING (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- Name: skill_revisions tenant_read_global_skill_revisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_read_global_skill_revisions ON public.skill_revisions FOR SELECT USING (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- Name: skills tenant_read_global_skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_read_global_skills ON public.skills FOR SELECT USING (((company_id IS NULL) OR (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- Name: skill_artifacts tenant_write_company_skill_artifacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_write_company_skill_artifacts ON public.skill_artifacts USING (((company_id IS NOT NULL) AND (company_id = (current_setting('app.current_tenant'::text, true))::uuid))) WITH CHECK (((company_id IS NOT NULL) AND (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- Name: skill_revisions tenant_write_company_skill_revisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_write_company_skill_revisions ON public.skill_revisions USING (((company_id IS NOT NULL) AND (company_id = (current_setting('app.current_tenant'::text, true))::uuid))) WITH CHECK (((company_id IS NOT NULL) AND (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- Name: skills tenant_write_company_skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_write_company_skills ON public.skills USING (((company_id IS NOT NULL) AND (company_id = (current_setting('app.current_tenant'::text, true))::uuid))) WITH CHECK (((company_id IS NOT NULL) AND (company_id = (current_setting('app.current_tenant'::text, true))::uuid)));


--
-- PostgreSQL database dump complete
--

\unrestrict iysUTecgFDbR13xTx5a4bU5PN1o3xuOXEB0HexXoTULy52C34K3U079vmXOURfZ

