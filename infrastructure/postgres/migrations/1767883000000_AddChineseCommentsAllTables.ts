import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 为全部业务表及列补充中文注释（含 TypeORM migrations 元数据表）。
 * 对已存在注释的表/列执行 COMMENT ON 会覆盖为本文案。
 */
export class AddChineseCommentsAllTables1767883000000 implements MigrationInterface {
  name = 'AddChineseCommentsAllTables1767883000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- users
      COMMENT ON TABLE "users" IS '用户表';
      COMMENT ON COLUMN "users"."id" IS '主键 UUID';
      COMMENT ON COLUMN "users"."username" IS '用户名';
      COMMENT ON COLUMN "users"."email" IS '邮箱';
      COMMENT ON COLUMN "users"."passwordHash" IS '密码哈希';
      COMMENT ON COLUMN "users"."roles" IS '角色列表（JSON 数组）';
      COMMENT ON COLUMN "users"."permissions" IS '权限列表（JSON 数组）';
      COMMENT ON COLUMN "users"."enabled" IS '是否启用';
      COMMENT ON COLUMN "users"."lastLoginAt" IS '最后登录时间';
      COMMENT ON COLUMN "users"."createdAt" IS '创建时间';
      COMMENT ON COLUMN "users"."updatedAt" IS '更新时间';
      COMMENT ON COLUMN "users"."deletedAt" IS '软删除时间（为空表示未删除）';

      -- oauth_accounts
      COMMENT ON TABLE "oauth_accounts" IS '第三方 OAuth 账号绑定表';
      COMMENT ON COLUMN "oauth_accounts"."id" IS '主键 UUID';
      COMMENT ON COLUMN "oauth_accounts"."userId" IS '关联本地用户 ID';
      COMMENT ON COLUMN "oauth_accounts"."provider" IS '第三方平台标识';
      COMMENT ON COLUMN "oauth_accounts"."providerUserId" IS '第三方平台用户 ID';
      COMMENT ON COLUMN "oauth_accounts"."providerUsername" IS '第三方平台展示名';
      COMMENT ON COLUMN "oauth_accounts"."accessToken" IS '访问令牌';
      COMMENT ON COLUMN "oauth_accounts"."refreshToken" IS '刷新令牌';
      COMMENT ON COLUMN "oauth_accounts"."expiresAt" IS '访问令牌过期时间';
      COMMENT ON COLUMN "oauth_accounts"."profileData" IS '第三方用户资料（JSON）';
      COMMENT ON COLUMN "oauth_accounts"."createdAt" IS '创建时间';
      COMMENT ON COLUMN "oauth_accounts"."updatedAt" IS '更新时间';

      -- api_keys
      COMMENT ON TABLE api_keys IS '网关 API 密钥表';
      COMMENT ON COLUMN api_keys.id IS '主键 UUID';
      COMMENT ON COLUMN api_keys.key_id IS '对外可见的密钥 ID';
      COMMENT ON COLUMN api_keys.key_hash IS '密钥哈希（不落明文）';
      COMMENT ON COLUMN api_keys.name IS '密钥名称';
      COMMENT ON COLUMN api_keys.description IS '描述';
      COMMENT ON COLUMN api_keys.permissions IS '权限范围（JSON）';
      COMMENT ON COLUMN api_keys.expires_at IS '过期时间';
      COMMENT ON COLUMN api_keys.is_active IS '是否启用';
      COMMENT ON COLUMN api_keys.created_at IS '创建时间';
      COMMENT ON COLUMN api_keys.updated_at IS '更新时间';

      -- routes
      COMMENT ON TABLE routes IS '网关路由与转发规则表';
      COMMENT ON COLUMN routes.id IS '主键 UUID';
      COMMENT ON COLUMN routes.path IS '匹配路径';
      COMMENT ON COLUMN routes.service IS '目标服务名';
      COMMENT ON COLUMN routes.rewrite_path IS '路径重写目标';
      COMMENT ON COLUMN routes.auth_required IS '是否需要认证';
      COMMENT ON COLUMN routes.is_active IS '是否启用';
      COMMENT ON COLUMN routes.priority IS '匹配优先级（数值越大越优先）';
      COMMENT ON COLUMN routes.description IS '说明';
      COMMENT ON COLUMN routes.created_at IS '创建时间';
      COMMENT ON COLUMN routes.updated_at IS '更新时间';
      COMMENT ON COLUMN routes.transport IS '传输方式：http 或 rpc';
      COMMENT ON COLUMN routes.rpc_client_name IS 'RPC 客户端名称';
      COMMENT ON COLUMN routes.rpc_pattern IS 'RPC 消息模式';
      COMMENT ON COLUMN routes.rpc_timeout_ms IS 'RPC 超时毫秒';

      -- audit_logs
      COMMENT ON TABLE audit_logs IS '网关/API 审计日志表';
      COMMENT ON COLUMN audit_logs.id IS '主键 UUID';
      COMMENT ON COLUMN audit_logs.request_id IS '请求追踪 ID';
      COMMENT ON COLUMN audit_logs.user_id IS '用户 ID（可空）';
      COMMENT ON COLUMN audit_logs.api_key_id IS 'API 密钥 ID（可空）';
      COMMENT ON COLUMN audit_logs.company_id IS '公司 ID（租户上下文）';
      COMMENT ON COLUMN audit_logs.service IS '服务名称';
      COMMENT ON COLUMN audit_logs.method IS 'HTTP 方法';
      COMMENT ON COLUMN audit_logs.path IS '请求路径';
      COMMENT ON COLUMN audit_logs.status_code IS 'HTTP 状态码';
      COMMENT ON COLUMN audit_logs.request_headers IS '请求头（JSON，已脱敏）';
      COMMENT ON COLUMN audit_logs.request_body IS '请求体（已脱敏）';
      COMMENT ON COLUMN audit_logs.response_body IS '响应体（已脱敏，通常仅错误）';
      COMMENT ON COLUMN audit_logs.client_ip IS '客户端 IP';
      COMMENT ON COLUMN audit_logs.user_agent IS 'User-Agent';
      COMMENT ON COLUMN audit_logs.duration_ms IS '耗时（毫秒）';
      COMMENT ON COLUMN audit_logs.error_message IS '错误信息';
      COMMENT ON COLUMN audit_logs.created_at IS '记录时间';

      -- companies
      COMMENT ON TABLE companies IS '公司（租户）基础信息表';
      COMMENT ON COLUMN companies.id IS '主键 UUID';
      COMMENT ON COLUMN companies.name IS '公司名称';
      COMMENT ON COLUMN companies.industry IS '行业';
      COMMENT ON COLUMN companies.scale IS '规模';
      COMMENT ON COLUMN companies.goal IS '经营目标描述';
      COMMENT ON COLUMN companies.initial_budget IS '初始预算';
      COMMENT ON COLUMN companies.is_active IS '是否启用';
      COMMENT ON COLUMN companies.created_by IS '创建人用户 ID';
      COMMENT ON COLUMN companies.created_at IS '创建时间';
      COMMENT ON COLUMN companies.updated_at IS '更新时间';
      COMMENT ON COLUMN companies.slug IS 'URL 友好标识';
      COMMENT ON COLUMN companies.status IS '状态（如 active）';
      COMMENT ON COLUMN companies.description IS '公司简介';
      COMMENT ON COLUMN companies.logo_url IS 'Logo 地址';
      COMMENT ON COLUMN companies.contact_email IS '联系邮箱';
      COMMENT ON COLUMN companies.contact_phone IS '联系电话';
      COMMENT ON COLUMN companies.timezone IS '时区';
      COMMENT ON COLUMN companies.default_language IS '默认语言';

      -- company_memberships
      COMMENT ON TABLE company_memberships IS '用户与公司成员关系表';
      COMMENT ON COLUMN company_memberships.id IS '主键 UUID';
      COMMENT ON COLUMN company_memberships.company_id IS '公司 ID';
      COMMENT ON COLUMN company_memberships.user_id IS '用户 ID';
      COMMENT ON COLUMN company_memberships.role IS '成员角色';
      COMMENT ON COLUMN company_memberships.is_active IS '关系是否有效';
      COMMENT ON COLUMN company_memberships.created_at IS '加入时间';
      COMMENT ON COLUMN company_memberships.updated_at IS '更新时间';

      -- organization_nodes
      COMMENT ON TABLE organization_nodes IS '组织架构节点表（树形）';
      COMMENT ON COLUMN organization_nodes.id IS '主键 UUID';
      COMMENT ON COLUMN organization_nodes.company_id IS '公司 ID';
      COMMENT ON COLUMN organization_nodes.parent_id IS '父节点 ID';
      COMMENT ON COLUMN organization_nodes.type IS '节点类型：董事会/CEO/部门/Agent 等';
      COMMENT ON COLUMN organization_nodes.name IS '节点名称';
      COMMENT ON COLUMN organization_nodes.description IS '描述';
      COMMENT ON COLUMN organization_nodes.agent_id IS '绑定的 Agent ID';
      COMMENT ON COLUMN organization_nodes.order_no IS '同级排序';
      COMMENT ON COLUMN organization_nodes.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN organization_nodes.created_at IS '创建时间';
      COMMENT ON COLUMN organization_nodes.updated_at IS '更新时间';

      -- organization_audit_logs
      COMMENT ON TABLE organization_audit_logs IS '组织架构变更审计表';
      COMMENT ON COLUMN organization_audit_logs.id IS '主键 UUID';
      COMMENT ON COLUMN organization_audit_logs.company_id IS '公司 ID';
      COMMENT ON COLUMN organization_audit_logs.user_id IS '操作人用户 ID';
      COMMENT ON COLUMN organization_audit_logs.node_id IS '被操作的组织节点 ID';
      COMMENT ON COLUMN organization_audit_logs.action IS '操作类型：创建/更新/移动/删除';
      COMMENT ON COLUMN organization_audit_logs.before_state IS '变更前快照（JSON）';
      COMMENT ON COLUMN organization_audit_logs.after_state IS '变更后快照（JSON）';
      COMMENT ON COLUMN organization_audit_logs.created_at IS '记录时间';

      -- agents
      COMMENT ON TABLE agents IS '公司内 AI Agent 定义表';
      COMMENT ON COLUMN agents.id IS '主键 UUID';
      COMMENT ON COLUMN agents.company_id IS '公司 ID';
      COMMENT ON COLUMN agents.organization_node_id IS '关联组织节点';
      COMMENT ON COLUMN agents.name IS 'Agent 名称';
      COMMENT ON COLUMN agents.role IS '组织角色（CEO/董事/执行等）';
      COMMENT ON COLUMN agents.expertise IS '专长描述';
      COMMENT ON COLUMN agents.avatar_url IS '头像 URL';
      COMMENT ON COLUMN agents.system_prompt IS '系统提示词';
      COMMENT ON COLUMN agents.llm_model IS '默认大模型名';
      COMMENT ON COLUMN agents.personality IS '人格配置（JSON）';
      COMMENT ON COLUMN agents.status IS '状态：活跃/停用/暂停';
      COMMENT ON COLUMN agents.human_in_loop IS '是否需要人工介入';
      COMMENT ON COLUMN agents.pending_config IS '待生效配置（JSON）';
      COMMENT ON COLUMN agents.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN agents.created_at IS '创建时间';
      COMMENT ON COLUMN agents.updated_at IS '更新时间';

      -- skills
      COMMENT ON TABLE skills IS '技能定义表（含平台级与公司级）';
      COMMENT ON COLUMN skills.id IS '主键 UUID';
      COMMENT ON COLUMN skills.company_id IS '公司 ID（空表示平台全局技能）';
      COMMENT ON COLUMN skills.name IS '技能名称';
      COMMENT ON COLUMN skills.category IS '分类';
      COMMENT ON COLUMN skills.description IS '说明';
      COMMENT ON COLUMN skills.tool_schema IS '工具参数 JSON Schema';
      COMMENT ON COLUMN skills.prompt_template IS '提示模板';
      COMMENT ON COLUMN skills.handler_config IS '处理器配置（JSON）';
      COMMENT ON COLUMN skills.implementation_type IS '实现类型：builtin/langgraph/api/external';
      COMMENT ON COLUMN skills.required_permissions IS '所需权限（JSON 数组）';
      COMMENT ON COLUMN skills.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN skills.version IS '版本号';
      COMMENT ON COLUMN skills.is_public IS '是否对租户可见';
      COMMENT ON COLUMN skills.is_system IS '是否为系统内置技能';
      COMMENT ON COLUMN skills.created_at IS '创建时间';
      COMMENT ON COLUMN skills.updated_at IS '更新时间';

      -- agent_skills
      COMMENT ON TABLE agent_skills IS 'Agent 与技能多对多关联表';
      COMMENT ON COLUMN agent_skills.agent_id IS 'Agent ID';
      COMMENT ON COLUMN agent_skills.skill_id IS '技能 ID';
      COMMENT ON COLUMN agent_skills.company_id IS '公司 ID（RLS）';
      COMMENT ON COLUMN agent_skills.created_at IS '绑定时间';

      -- agent_audit_logs
      COMMENT ON TABLE agent_audit_logs IS 'Agent 配置与状态变更审计';
      COMMENT ON COLUMN agent_audit_logs.id IS '主键 UUID';
      COMMENT ON COLUMN agent_audit_logs.company_id IS '公司 ID';
      COMMENT ON COLUMN agent_audit_logs.user_id IS '操作人用户 ID';
      COMMENT ON COLUMN agent_audit_logs.agent_id IS '相关 Agent ID';
      COMMENT ON COLUMN agent_audit_logs.action IS '操作动作描述';
      COMMENT ON COLUMN agent_audit_logs.before_state IS '变更前（JSON）';
      COMMENT ON COLUMN agent_audit_logs.after_state IS '变更后（JSON）';
      COMMENT ON COLUMN agent_audit_logs.created_at IS '记录时间';

      -- skill_execution_logs
      COMMENT ON TABLE skill_execution_logs IS '技能调用执行日志';
      COMMENT ON COLUMN skill_execution_logs.id IS '主键 UUID';
      COMMENT ON COLUMN skill_execution_logs.company_id IS '公司 ID';
      COMMENT ON COLUMN skill_execution_logs.agent_id IS '调用方 Agent ID';
      COMMENT ON COLUMN skill_execution_logs.skill_id IS '技能 ID（可空若已删）';
      COMMENT ON COLUMN skill_execution_logs.skill_name IS '技能名称快照';
      COMMENT ON COLUMN skill_execution_logs.trace_id IS '分布式追踪 ID';
      COMMENT ON COLUMN skill_execution_logs.args_summary IS '入参摘要（JSON）';
      COMMENT ON COLUMN skill_execution_logs.result_summary IS '结果摘要（JSON）';
      COMMENT ON COLUMN skill_execution_logs.duration_ms IS '耗时（毫秒）';
      COMMENT ON COLUMN skill_execution_logs.billing_units IS '计费单位';
      COMMENT ON COLUMN skill_execution_logs.created_at IS '记录时间';

      -- organization_node_skills
      COMMENT ON TABLE organization_node_skills IS '组织节点与可用技能关联';
      COMMENT ON COLUMN organization_node_skills.organization_node_id IS '组织节点 ID';
      COMMENT ON COLUMN organization_node_skills.skill_id IS '技能 ID';
      COMMENT ON COLUMN organization_node_skills.company_id IS '公司 ID';
      COMMENT ON COLUMN organization_node_skills.created_at IS '绑定时间';

      -- chat_rooms
      COMMENT ON TABLE chat_rooms IS '协作聊天室';
      COMMENT ON COLUMN chat_rooms.id IS '主键 UUID';
      COMMENT ON COLUMN chat_rooms.company_id IS '公司 ID';
      COMMENT ON COLUMN chat_rooms.room_type IS '房间类型：主会话/部门/任务/自定义';
      COMMENT ON COLUMN chat_rooms.name IS '房间名称';
      COMMENT ON COLUMN chat_rooms.organization_node_id IS '关联组织节点';
      COMMENT ON COLUMN chat_rooms.task_id IS '关联任务 ID';
      COMMENT ON COLUMN chat_rooms.created_by IS '创建人用户 ID';
      COMMENT ON COLUMN chat_rooms.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN chat_rooms.message_seq IS '最新消息序号（单调递增）';
      COMMENT ON COLUMN chat_rooms.created_at IS '创建时间';
      COMMENT ON COLUMN chat_rooms.updated_at IS '更新时间';

      -- room_members
      COMMENT ON TABLE room_members IS '聊天室成员（人或 Agent）';
      COMMENT ON COLUMN room_members.id IS '主键 UUID';
      COMMENT ON COLUMN room_members.company_id IS '公司 ID';
      COMMENT ON COLUMN room_members.room_id IS '房间 ID';
      COMMENT ON COLUMN room_members.member_type IS '成员类型：human 或 agent';
      COMMENT ON COLUMN room_members.member_id IS '用户 ID 或 Agent ID';
      COMMENT ON COLUMN room_members.joined_at IS '加入时间';
      COMMENT ON COLUMN room_members.left_at IS '离开时间';

      -- chat_messages
      COMMENT ON TABLE chat_messages IS '聊天消息';
      COMMENT ON COLUMN chat_messages.id IS '主键 UUID';
      COMMENT ON COLUMN chat_messages.company_id IS '公司 ID';
      COMMENT ON COLUMN chat_messages.room_id IS '房间 ID';
      COMMENT ON COLUMN chat_messages.seq IS '房间内递增序号';
      COMMENT ON COLUMN chat_messages.sender_type IS '发送方类型：human 或 agent';
      COMMENT ON COLUMN chat_messages.sender_id IS '发送方 ID';
      COMMENT ON COLUMN chat_messages.message_type IS '消息类型：文本/系统/工具调用/流片段等';
      COMMENT ON COLUMN chat_messages.content IS '正文内容';
      COMMENT ON COLUMN chat_messages.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN chat_messages.created_at IS '发送时间';
      COMMENT ON COLUMN chat_messages.content_tsv IS '全文检索向量（生成列）';

      -- memory_collections
      COMMENT ON TABLE memory_collections IS '记忆集合（命名空间）';
      COMMENT ON COLUMN memory_collections.id IS '主键 UUID';
      COMMENT ON COLUMN memory_collections.company_id IS '公司 ID';
      COMMENT ON COLUMN memory_collections.namespace IS '命名空间标识';
      COMMENT ON COLUMN memory_collections.label IS '展示标签';
      COMMENT ON COLUMN memory_collections.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN memory_collections.created_at IS '创建时间';

      -- memory_entries
      COMMENT ON TABLE memory_entries IS '记忆条目（向量+文本）';
      COMMENT ON COLUMN memory_entries.id IS '主键 UUID';
      COMMENT ON COLUMN memory_entries.company_id IS '公司 ID';
      COMMENT ON COLUMN memory_entries.collection_id IS '所属集合 ID';
      COMMENT ON COLUMN memory_entries.content IS '文本内容';
      COMMENT ON COLUMN memory_entries.embedding IS '嵌入向量（float8[]，长度 1536）';
      COMMENT ON COLUMN memory_entries.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN memory_entries.source_type IS '来源类型：聊天/任务/技能等';
      COMMENT ON COLUMN memory_entries.source_ref IS '来源实体 ID';
      COMMENT ON COLUMN memory_entries.is_sensitive IS '是否敏感（检索时可脱敏）';
      COMMENT ON COLUMN memory_entries.created_at IS '写入时间';

      -- tasks
      COMMENT ON TABLE tasks IS '任务表（支持父子任务）';
      COMMENT ON COLUMN tasks.id IS '主键 UUID';
      COMMENT ON COLUMN tasks.company_id IS '公司 ID';
      COMMENT ON COLUMN tasks.parent_id IS '父任务 ID';
      COMMENT ON COLUMN tasks.title IS '标题';
      COMMENT ON COLUMN tasks.description IS '描述';
      COMMENT ON COLUMN tasks.status IS '状态';
      COMMENT ON COLUMN tasks.priority IS '优先级';
      COMMENT ON COLUMN tasks.due_date IS '截止时间';
      COMMENT ON COLUMN tasks.expected_output IS '期望产出说明';
      COMMENT ON COLUMN tasks.progress IS '进度 0–100';
      COMMENT ON COLUMN tasks.assignee_type IS '受指派人类型';
      COMMENT ON COLUMN tasks.assignee_id IS '受指派人/节点 ID';
      COMMENT ON COLUMN tasks.skill_ids IS '关联技能 ID 列表（JSON）';
      COMMENT ON COLUMN tasks.blocked_reason IS '阻塞原因';
      COMMENT ON COLUMN tasks.requires_human_approval IS '是否需要人工审批';
      COMMENT ON COLUMN tasks.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN tasks.created_by_user_id IS '创建人用户 ID';
      COMMENT ON COLUMN tasks.created_at IS '创建时间';
      COMMENT ON COLUMN tasks.updated_at IS '更新时间';

      -- task_assignments
      COMMENT ON TABLE task_assignments IS '任务指派历史';
      COMMENT ON COLUMN task_assignments.id IS '主键 UUID';
      COMMENT ON COLUMN task_assignments.company_id IS '公司 ID';
      COMMENT ON COLUMN task_assignments.task_id IS '任务 ID';
      COMMENT ON COLUMN task_assignments.assignee_type IS '受指派人类型';
      COMMENT ON COLUMN task_assignments.assignee_id IS '受指派人 ID';
      COMMENT ON COLUMN task_assignments.assigned_by_user_id IS '指派人用户 ID';
      COMMENT ON COLUMN task_assignments.assigned_at IS '指派时间';
      COMMENT ON COLUMN task_assignments.unassigned_at IS '取消指派时间';
      COMMENT ON COLUMN task_assignments.note IS '备注';

      -- task_execution_logs
      COMMENT ON TABLE task_execution_logs IS '任务执行步骤日志';
      COMMENT ON COLUMN task_execution_logs.id IS '主键 UUID';
      COMMENT ON COLUMN task_execution_logs.company_id IS '公司 ID';
      COMMENT ON COLUMN task_execution_logs.task_id IS '任务 ID';
      COMMENT ON COLUMN task_execution_logs.agent_id IS '执行 Agent ID';
      COMMENT ON COLUMN task_execution_logs.step_type IS '步骤类型';
      COMMENT ON COLUMN task_execution_logs.message IS '文本说明';
      COMMENT ON COLUMN task_execution_logs.output_snapshot IS '输出快照（JSON）';
      COMMENT ON COLUMN task_execution_logs.billing_units IS '计费单位';
      COMMENT ON COLUMN task_execution_logs.duration_ms IS '耗时（毫秒）';
      COMMENT ON COLUMN task_execution_logs.trace_id IS '追踪 ID';
      COMMENT ON COLUMN task_execution_logs.created_at IS '记录时间';

      -- billing_settings
      COMMENT ON TABLE billing_settings IS '公司计费与模型路由策略（每公司一行）';
      COMMENT ON COLUMN billing_settings.company_id IS '公司 ID（主键）';
      COMMENT ON COLUMN billing_settings.routing_policy IS '路由策略（JSON）';
      COMMENT ON COLUMN billing_settings.degrade_threshold_pct IS '降级阈值百分比';
      COMMENT ON COLUMN billing_settings.fallback_model IS '降级备用模型名';
      COMMENT ON COLUMN billing_settings.created_at IS '创建时间';
      COMMENT ON COLUMN billing_settings.updated_at IS '更新时间';

      -- budgets
      COMMENT ON TABLE budgets IS '预算额度（公司/部门/Agent 维度）';
      COMMENT ON COLUMN budgets.id IS '主键 UUID';
      COMMENT ON COLUMN budgets.company_id IS '公司 ID';
      COMMENT ON COLUMN budgets.scope IS '范围：公司/部门/Agent';
      COMMENT ON COLUMN budgets.department_id IS '部门组织节点 ID';
      COMMENT ON COLUMN budgets.agent_id IS 'Agent ID';
      COMMENT ON COLUMN budgets.period IS '周期：无/月/季';
      COMMENT ON COLUMN budgets.currency IS '货币';
      COMMENT ON COLUMN budgets.total_amount IS '预算总额';
      COMMENT ON COLUMN budgets.used_amount IS '已用金额';
      COMMENT ON COLUMN budgets.warning_threshold IS '预警阈值（0–1）';
      COMMENT ON COLUMN budgets.period_start IS '周期开始';
      COMMENT ON COLUMN budgets.period_end IS '周期结束';
      COMMENT ON COLUMN budgets.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN budgets.created_at IS '创建时间';
      COMMENT ON COLUMN budgets.updated_at IS '更新时间';

      -- model_pricing
      COMMENT ON TABLE model_pricing IS '模型单价（平台默认与公司覆盖）';
      COMMENT ON COLUMN model_pricing.id IS '主键 UUID';
      COMMENT ON COLUMN model_pricing.company_id IS '公司 ID（空为平台价）';
      COMMENT ON COLUMN model_pricing.model_name IS '模型名称';
      COMMENT ON COLUMN model_pricing.input_price_per_million IS '输入每百万 token 价格';
      COMMENT ON COLUMN model_pricing.output_price_per_million IS '输出每百万 token 价格';
      COMMENT ON COLUMN model_pricing.embedding_price_per_million IS '嵌入每百万 token 价格';
      COMMENT ON COLUMN model_pricing.skill_base_fee IS '技能基础费';
      COMMENT ON COLUMN model_pricing.currency IS '货币';
      COMMENT ON COLUMN model_pricing.effective_from IS '生效起始时间';
      COMMENT ON COLUMN model_pricing.effective_to IS '生效结束时间（可空）';
      COMMENT ON COLUMN model_pricing.created_at IS '创建时间';
      COMMENT ON COLUMN model_pricing.updated_at IS '更新时间';

      -- billing_records
      COMMENT ON TABLE billing_records IS '计费流水（追加型，禁止应用层删改）';
      COMMENT ON COLUMN billing_records.id IS '主键 UUID';
      COMMENT ON COLUMN billing_records.company_id IS '公司 ID';
      COMMENT ON COLUMN billing_records.department_id IS '部门 ID';
      COMMENT ON COLUMN billing_records.agent_id IS 'Agent ID';
      COMMENT ON COLUMN billing_records.task_id IS '任务 ID';
      COMMENT ON COLUMN billing_records.skill_id IS '技能 ID';
      COMMENT ON COLUMN billing_records.record_type IS '记录类型：LLM/技能/嵌入等';
      COMMENT ON COLUMN billing_records.model_name IS '模型名称';
      COMMENT ON COLUMN billing_records.input_tokens IS '输入 token 数';
      COMMENT ON COLUMN billing_records.output_tokens IS '输出 token 数';
      COMMENT ON COLUMN billing_records.skill_call_units IS '技能调用单位';
      COMMENT ON COLUMN billing_records.cost IS '费用';
      COMMENT ON COLUMN billing_records.currency IS '货币';
      COMMENT ON COLUMN billing_records.idempotency_key IS '幂等键（防重复计费）';
      COMMENT ON COLUMN billing_records.metadata IS '扩展信息（JSON）';
      COMMENT ON COLUMN billing_records.occurred_at IS '业务发生时间';
      COMMENT ON COLUMN billing_records.created_at IS '写入时间';

      -- company_templates
      COMMENT ON TABLE company_templates IS '公司创建模板目录（平台级）';
      COMMENT ON COLUMN company_templates.id IS '主键 UUID';
      COMMENT ON COLUMN company_templates.slug IS 'URL 友好唯一标识';
      COMMENT ON COLUMN company_templates.name IS '模板名称';
      COMMENT ON COLUMN company_templates.description IS '描述';
      COMMENT ON COLUMN company_templates.industry IS '适用行业';
      COMMENT ON COLUMN company_templates.scale IS '适用规模';
      COMMENT ON COLUMN company_templates.template_type IS '模板类型';
      COMMENT ON COLUMN company_templates.preview_image_url IS '预览图 URL';
      COMMENT ON COLUMN company_templates.price_cents IS '价格（分）';
      COMMENT ON COLUMN company_templates.currency IS '货币';
      COMMENT ON COLUMN company_templates.is_published IS '是否上架';
      COMMENT ON COLUMN company_templates.version IS '版本号';
      COMMENT ON COLUMN company_templates.usage_count IS '使用次数';
      COMMENT ON COLUMN company_templates.rating_avg IS '平均评分';
      COMMENT ON COLUMN company_templates.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN company_templates.created_at IS '创建时间';
      COMMENT ON COLUMN company_templates.updated_at IS '更新时间';

      -- template_contents
      COMMENT ON TABLE template_contents IS '模板内容快照（一对一）';
      COMMENT ON COLUMN template_contents.template_id IS '模板 ID（主键）';
      COMMENT ON COLUMN template_contents.content IS '结构化模板内容（JSON）';
      COMMENT ON COLUMN template_contents.created_at IS '创建时间';
      COMMENT ON COLUMN template_contents.updated_at IS '更新时间';

      -- marketplace_agents
      COMMENT ON TABLE marketplace_agents IS 'Agent 商城商品目录';
      COMMENT ON COLUMN marketplace_agents.id IS '主键 UUID';
      COMMENT ON COLUMN marketplace_agents.slug IS '唯一标识';
      COMMENT ON COLUMN marketplace_agents.name IS '名称';
      COMMENT ON COLUMN marketplace_agents.description IS '描述';
      COMMENT ON COLUMN marketplace_agents.expertise IS '专长';
      COMMENT ON COLUMN marketplace_agents.system_prompt IS '系统提示词';
      COMMENT ON COLUMN marketplace_agents.recommended_skills IS '推荐技能（JSON）';
      COMMENT ON COLUMN marketplace_agents.pricing_model IS '计价模式';
      COMMENT ON COLUMN marketplace_agents.price_cents IS '价格（分）';
      COMMENT ON COLUMN marketplace_agents.subscription_interval IS '订阅周期';
      COMMENT ON COLUMN marketplace_agents.is_published IS '是否上架';
      COMMENT ON COLUMN marketplace_agents.usage_count IS '使用次数';
      COMMENT ON COLUMN marketplace_agents.rating_avg IS '平均评分';
      COMMENT ON COLUMN marketplace_agents.metadata IS '扩展元数据（JSON）';
      COMMENT ON COLUMN marketplace_agents.created_at IS '创建时间';
      COMMENT ON COLUMN marketplace_agents.updated_at IS '更新时间';

      -- template_agent_mappings
      COMMENT ON TABLE template_agent_mappings IS '模板与商城 Agent 关联';
      COMMENT ON COLUMN template_agent_mappings.id IS '主键 UUID';
      COMMENT ON COLUMN template_agent_mappings.template_id IS '模板 ID';
      COMMENT ON COLUMN template_agent_mappings.marketplace_agent_id IS '商城 Agent ID';
      COMMENT ON COLUMN template_agent_mappings.sort_order IS '排序';
      COMMENT ON COLUMN template_agent_mappings.role_hint IS '角色提示';
      COMMENT ON COLUMN template_agent_mappings.created_at IS '创建时间';

      -- TypeORM 迁移记录表
      COMMENT ON TABLE migrations IS 'TypeORM 已执行数据库迁移记录';
      COMMENT ON COLUMN migrations.id IS '自增主键';
      COMMENT ON COLUMN migrations.timestamp IS '迁移类时间戳';
      COMMENT ON COLUMN migrations.name IS '迁移类名称';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      COMMENT ON TABLE migrations IS NULL;
      COMMENT ON COLUMN migrations.id IS NULL;
      COMMENT ON COLUMN migrations.timestamp IS NULL;
      COMMENT ON COLUMN migrations.name IS NULL;

      COMMENT ON TABLE template_agent_mappings IS NULL;
      COMMENT ON COLUMN template_agent_mappings.id IS NULL;
      COMMENT ON COLUMN template_agent_mappings.template_id IS NULL;
      COMMENT ON COLUMN template_agent_mappings.marketplace_agent_id IS NULL;
      COMMENT ON COLUMN template_agent_mappings.sort_order IS NULL;
      COMMENT ON COLUMN template_agent_mappings.role_hint IS NULL;
      COMMENT ON COLUMN template_agent_mappings.created_at IS NULL;

      COMMENT ON TABLE marketplace_agents IS NULL;
      COMMENT ON COLUMN marketplace_agents.id IS NULL;
      COMMENT ON COLUMN marketplace_agents.slug IS NULL;
      COMMENT ON COLUMN marketplace_agents.name IS NULL;
      COMMENT ON COLUMN marketplace_agents.description IS NULL;
      COMMENT ON COLUMN marketplace_agents.expertise IS NULL;
      COMMENT ON COLUMN marketplace_agents.system_prompt IS NULL;
      COMMENT ON COLUMN marketplace_agents.recommended_skills IS NULL;
      COMMENT ON COLUMN marketplace_agents.pricing_model IS NULL;
      COMMENT ON COLUMN marketplace_agents.price_cents IS NULL;
      COMMENT ON COLUMN marketplace_agents.subscription_interval IS NULL;
      COMMENT ON COLUMN marketplace_agents.is_published IS NULL;
      COMMENT ON COLUMN marketplace_agents.usage_count IS NULL;
      COMMENT ON COLUMN marketplace_agents.rating_avg IS NULL;
      COMMENT ON COLUMN marketplace_agents.metadata IS NULL;
      COMMENT ON COLUMN marketplace_agents.created_at IS NULL;
      COMMENT ON COLUMN marketplace_agents.updated_at IS NULL;

      COMMENT ON TABLE template_contents IS NULL;
      COMMENT ON COLUMN template_contents.template_id IS NULL;
      COMMENT ON COLUMN template_contents.content IS NULL;
      COMMENT ON COLUMN template_contents.created_at IS NULL;
      COMMENT ON COLUMN template_contents.updated_at IS NULL;

      COMMENT ON TABLE company_templates IS NULL;
      COMMENT ON COLUMN company_templates.id IS NULL;
      COMMENT ON COLUMN company_templates.slug IS NULL;
      COMMENT ON COLUMN company_templates.name IS NULL;
      COMMENT ON COLUMN company_templates.description IS NULL;
      COMMENT ON COLUMN company_templates.industry IS NULL;
      COMMENT ON COLUMN company_templates.scale IS NULL;
      COMMENT ON COLUMN company_templates.template_type IS NULL;
      COMMENT ON COLUMN company_templates.preview_image_url IS NULL;
      COMMENT ON COLUMN company_templates.price_cents IS NULL;
      COMMENT ON COLUMN company_templates.currency IS NULL;
      COMMENT ON COLUMN company_templates.is_published IS NULL;
      COMMENT ON COLUMN company_templates.version IS NULL;
      COMMENT ON COLUMN company_templates.usage_count IS NULL;
      COMMENT ON COLUMN company_templates.rating_avg IS NULL;
      COMMENT ON COLUMN company_templates.metadata IS NULL;
      COMMENT ON COLUMN company_templates.created_at IS NULL;
      COMMENT ON COLUMN company_templates.updated_at IS NULL;

      COMMENT ON TABLE billing_records IS NULL;
      COMMENT ON COLUMN billing_records.id IS NULL;
      COMMENT ON COLUMN billing_records.company_id IS NULL;
      COMMENT ON COLUMN billing_records.department_id IS NULL;
      COMMENT ON COLUMN billing_records.agent_id IS NULL;
      COMMENT ON COLUMN billing_records.task_id IS NULL;
      COMMENT ON COLUMN billing_records.skill_id IS NULL;
      COMMENT ON COLUMN billing_records.record_type IS NULL;
      COMMENT ON COLUMN billing_records.model_name IS NULL;
      COMMENT ON COLUMN billing_records.input_tokens IS NULL;
      COMMENT ON COLUMN billing_records.output_tokens IS NULL;
      COMMENT ON COLUMN billing_records.skill_call_units IS NULL;
      COMMENT ON COLUMN billing_records.cost IS NULL;
      COMMENT ON COLUMN billing_records.currency IS NULL;
      COMMENT ON COLUMN billing_records.idempotency_key IS NULL;
      COMMENT ON COLUMN billing_records.metadata IS NULL;
      COMMENT ON COLUMN billing_records.occurred_at IS NULL;
      COMMENT ON COLUMN billing_records.created_at IS NULL;

      COMMENT ON TABLE model_pricing IS NULL;
      COMMENT ON COLUMN model_pricing.id IS NULL;
      COMMENT ON COLUMN model_pricing.company_id IS NULL;
      COMMENT ON COLUMN model_pricing.model_name IS NULL;
      COMMENT ON COLUMN model_pricing.input_price_per_million IS NULL;
      COMMENT ON COLUMN model_pricing.output_price_per_million IS NULL;
      COMMENT ON COLUMN model_pricing.embedding_price_per_million IS NULL;
      COMMENT ON COLUMN model_pricing.skill_base_fee IS NULL;
      COMMENT ON COLUMN model_pricing.currency IS NULL;
      COMMENT ON COLUMN model_pricing.effective_from IS NULL;
      COMMENT ON COLUMN model_pricing.effective_to IS NULL;
      COMMENT ON COLUMN model_pricing.created_at IS NULL;
      COMMENT ON COLUMN model_pricing.updated_at IS NULL;

      COMMENT ON TABLE budgets IS NULL;
      COMMENT ON COLUMN budgets.id IS NULL;
      COMMENT ON COLUMN budgets.company_id IS NULL;
      COMMENT ON COLUMN budgets.scope IS NULL;
      COMMENT ON COLUMN budgets.department_id IS NULL;
      COMMENT ON COLUMN budgets.agent_id IS NULL;
      COMMENT ON COLUMN budgets.period IS NULL;
      COMMENT ON COLUMN budgets.currency IS NULL;
      COMMENT ON COLUMN budgets.total_amount IS NULL;
      COMMENT ON COLUMN budgets.used_amount IS NULL;
      COMMENT ON COLUMN budgets.warning_threshold IS NULL;
      COMMENT ON COLUMN budgets.period_start IS NULL;
      COMMENT ON COLUMN budgets.period_end IS NULL;
      COMMENT ON COLUMN budgets.metadata IS NULL;
      COMMENT ON COLUMN budgets.created_at IS NULL;
      COMMENT ON COLUMN budgets.updated_at IS NULL;

      COMMENT ON TABLE billing_settings IS NULL;
      COMMENT ON COLUMN billing_settings.company_id IS NULL;
      COMMENT ON COLUMN billing_settings.routing_policy IS NULL;
      COMMENT ON COLUMN billing_settings.degrade_threshold_pct IS NULL;
      COMMENT ON COLUMN billing_settings.fallback_model IS NULL;
      COMMENT ON COLUMN billing_settings.created_at IS NULL;
      COMMENT ON COLUMN billing_settings.updated_at IS NULL;

      COMMENT ON TABLE task_execution_logs IS NULL;
      COMMENT ON COLUMN task_execution_logs.id IS NULL;
      COMMENT ON COLUMN task_execution_logs.company_id IS NULL;
      COMMENT ON COLUMN task_execution_logs.task_id IS NULL;
      COMMENT ON COLUMN task_execution_logs.agent_id IS NULL;
      COMMENT ON COLUMN task_execution_logs.step_type IS NULL;
      COMMENT ON COLUMN task_execution_logs.message IS NULL;
      COMMENT ON COLUMN task_execution_logs.output_snapshot IS NULL;
      COMMENT ON COLUMN task_execution_logs.billing_units IS NULL;
      COMMENT ON COLUMN task_execution_logs.duration_ms IS NULL;
      COMMENT ON COLUMN task_execution_logs.trace_id IS NULL;
      COMMENT ON COLUMN task_execution_logs.created_at IS NULL;

      COMMENT ON TABLE task_assignments IS NULL;
      COMMENT ON COLUMN task_assignments.id IS NULL;
      COMMENT ON COLUMN task_assignments.company_id IS NULL;
      COMMENT ON COLUMN task_assignments.task_id IS NULL;
      COMMENT ON COLUMN task_assignments.assignee_type IS NULL;
      COMMENT ON COLUMN task_assignments.assignee_id IS NULL;
      COMMENT ON COLUMN task_assignments.assigned_by_user_id IS NULL;
      COMMENT ON COLUMN task_assignments.assigned_at IS NULL;
      COMMENT ON COLUMN task_assignments.unassigned_at IS NULL;
      COMMENT ON COLUMN task_assignments.note IS NULL;

      COMMENT ON TABLE tasks IS NULL;
      COMMENT ON COLUMN tasks.id IS NULL;
      COMMENT ON COLUMN tasks.company_id IS NULL;
      COMMENT ON COLUMN tasks.parent_id IS NULL;
      COMMENT ON COLUMN tasks.title IS NULL;
      COMMENT ON COLUMN tasks.description IS NULL;
      COMMENT ON COLUMN tasks.status IS NULL;
      COMMENT ON COLUMN tasks.priority IS NULL;
      COMMENT ON COLUMN tasks.due_date IS NULL;
      COMMENT ON COLUMN tasks.expected_output IS NULL;
      COMMENT ON COLUMN tasks.progress IS NULL;
      COMMENT ON COLUMN tasks.assignee_type IS NULL;
      COMMENT ON COLUMN tasks.assignee_id IS NULL;
      COMMENT ON COLUMN tasks.skill_ids IS NULL;
      COMMENT ON COLUMN tasks.blocked_reason IS NULL;
      COMMENT ON COLUMN tasks.requires_human_approval IS NULL;
      COMMENT ON COLUMN tasks.metadata IS NULL;
      COMMENT ON COLUMN tasks.created_by_user_id IS NULL;
      COMMENT ON COLUMN tasks.created_at IS NULL;
      COMMENT ON COLUMN tasks.updated_at IS NULL;

      COMMENT ON TABLE memory_entries IS NULL;
      COMMENT ON COLUMN memory_entries.id IS NULL;
      COMMENT ON COLUMN memory_entries.company_id IS NULL;
      COMMENT ON COLUMN memory_entries.collection_id IS NULL;
      COMMENT ON COLUMN memory_entries.content IS NULL;
      COMMENT ON COLUMN memory_entries.embedding IS NULL;
      COMMENT ON COLUMN memory_entries.metadata IS NULL;
      COMMENT ON COLUMN memory_entries.source_type IS NULL;
      COMMENT ON COLUMN memory_entries.source_ref IS NULL;
      COMMENT ON COLUMN memory_entries.is_sensitive IS NULL;
      COMMENT ON COLUMN memory_entries.created_at IS NULL;

      COMMENT ON TABLE memory_collections IS NULL;
      COMMENT ON COLUMN memory_collections.id IS NULL;
      COMMENT ON COLUMN memory_collections.company_id IS NULL;
      COMMENT ON COLUMN memory_collections.namespace IS NULL;
      COMMENT ON COLUMN memory_collections.label IS NULL;
      COMMENT ON COLUMN memory_collections.metadata IS NULL;
      COMMENT ON COLUMN memory_collections.created_at IS NULL;

      COMMENT ON TABLE chat_messages IS NULL;
      COMMENT ON COLUMN chat_messages.id IS NULL;
      COMMENT ON COLUMN chat_messages.company_id IS NULL;
      COMMENT ON COLUMN chat_messages.room_id IS NULL;
      COMMENT ON COLUMN chat_messages.seq IS NULL;
      COMMENT ON COLUMN chat_messages.sender_type IS NULL;
      COMMENT ON COLUMN chat_messages.sender_id IS NULL;
      COMMENT ON COLUMN chat_messages.message_type IS NULL;
      COMMENT ON COLUMN chat_messages.content IS NULL;
      COMMENT ON COLUMN chat_messages.metadata IS NULL;
      COMMENT ON COLUMN chat_messages.created_at IS NULL;
      COMMENT ON COLUMN chat_messages.content_tsv IS NULL;

      COMMENT ON TABLE room_members IS NULL;
      COMMENT ON COLUMN room_members.id IS NULL;
      COMMENT ON COLUMN room_members.company_id IS NULL;
      COMMENT ON COLUMN room_members.room_id IS NULL;
      COMMENT ON COLUMN room_members.member_type IS NULL;
      COMMENT ON COLUMN room_members.member_id IS NULL;
      COMMENT ON COLUMN room_members.joined_at IS NULL;
      COMMENT ON COLUMN room_members.left_at IS NULL;

      COMMENT ON TABLE chat_rooms IS NULL;
      COMMENT ON COLUMN chat_rooms.id IS NULL;
      COMMENT ON COLUMN chat_rooms.company_id IS NULL;
      COMMENT ON COLUMN chat_rooms.room_type IS NULL;
      COMMENT ON COLUMN chat_rooms.name IS NULL;
      COMMENT ON COLUMN chat_rooms.organization_node_id IS NULL;
      COMMENT ON COLUMN chat_rooms.task_id IS NULL;
      COMMENT ON COLUMN chat_rooms.created_by IS NULL;
      COMMENT ON COLUMN chat_rooms.metadata IS NULL;
      COMMENT ON COLUMN chat_rooms.message_seq IS NULL;
      COMMENT ON COLUMN chat_rooms.created_at IS NULL;
      COMMENT ON COLUMN chat_rooms.updated_at IS NULL;

      COMMENT ON TABLE organization_node_skills IS NULL;
      COMMENT ON COLUMN organization_node_skills.organization_node_id IS NULL;
      COMMENT ON COLUMN organization_node_skills.skill_id IS NULL;
      COMMENT ON COLUMN organization_node_skills.company_id IS NULL;
      COMMENT ON COLUMN organization_node_skills.created_at IS NULL;

      COMMENT ON TABLE skill_execution_logs IS NULL;
      COMMENT ON COLUMN skill_execution_logs.id IS NULL;
      COMMENT ON COLUMN skill_execution_logs.company_id IS NULL;
      COMMENT ON COLUMN skill_execution_logs.agent_id IS NULL;
      COMMENT ON COLUMN skill_execution_logs.skill_id IS NULL;
      COMMENT ON COLUMN skill_execution_logs.skill_name IS NULL;
      COMMENT ON COLUMN skill_execution_logs.trace_id IS NULL;
      COMMENT ON COLUMN skill_execution_logs.args_summary IS NULL;
      COMMENT ON COLUMN skill_execution_logs.result_summary IS NULL;
      COMMENT ON COLUMN skill_execution_logs.duration_ms IS NULL;
      COMMENT ON COLUMN skill_execution_logs.billing_units IS NULL;
      COMMENT ON COLUMN skill_execution_logs.created_at IS NULL;

      COMMENT ON TABLE agent_audit_logs IS NULL;
      COMMENT ON COLUMN agent_audit_logs.id IS NULL;
      COMMENT ON COLUMN agent_audit_logs.company_id IS NULL;
      COMMENT ON COLUMN agent_audit_logs.user_id IS NULL;
      COMMENT ON COLUMN agent_audit_logs.agent_id IS NULL;
      COMMENT ON COLUMN agent_audit_logs.action IS NULL;
      COMMENT ON COLUMN agent_audit_logs.before_state IS NULL;
      COMMENT ON COLUMN agent_audit_logs.after_state IS NULL;
      COMMENT ON COLUMN agent_audit_logs.created_at IS NULL;

      COMMENT ON TABLE agent_skills IS NULL;
      COMMENT ON COLUMN agent_skills.agent_id IS NULL;
      COMMENT ON COLUMN agent_skills.skill_id IS NULL;
      COMMENT ON COLUMN agent_skills.company_id IS NULL;
      COMMENT ON COLUMN agent_skills.created_at IS NULL;

      COMMENT ON TABLE skills IS NULL;
      COMMENT ON COLUMN skills.id IS NULL;
      COMMENT ON COLUMN skills.company_id IS NULL;
      COMMENT ON COLUMN skills.name IS NULL;
      COMMENT ON COLUMN skills.category IS NULL;
      COMMENT ON COLUMN skills.description IS NULL;
      COMMENT ON COLUMN skills.tool_schema IS NULL;
      COMMENT ON COLUMN skills.prompt_template IS NULL;
      COMMENT ON COLUMN skills.handler_config IS NULL;
      COMMENT ON COLUMN skills.implementation_type IS NULL;
      COMMENT ON COLUMN skills.required_permissions IS NULL;
      COMMENT ON COLUMN skills.metadata IS NULL;
      COMMENT ON COLUMN skills.version IS NULL;
      COMMENT ON COLUMN skills.is_public IS NULL;
      COMMENT ON COLUMN skills.is_system IS NULL;
      COMMENT ON COLUMN skills.created_at IS NULL;
      COMMENT ON COLUMN skills.updated_at IS NULL;

      COMMENT ON TABLE agents IS NULL;
      COMMENT ON COLUMN agents.id IS NULL;
      COMMENT ON COLUMN agents.company_id IS NULL;
      COMMENT ON COLUMN agents.organization_node_id IS NULL;
      COMMENT ON COLUMN agents.name IS NULL;
      COMMENT ON COLUMN agents.role IS NULL;
      COMMENT ON COLUMN agents.expertise IS NULL;
      COMMENT ON COLUMN agents.avatar_url IS NULL;
      COMMENT ON COLUMN agents.system_prompt IS NULL;
      COMMENT ON COLUMN agents.llm_model IS NULL;
      COMMENT ON COLUMN agents.personality IS NULL;
      COMMENT ON COLUMN agents.status IS NULL;
      COMMENT ON COLUMN agents.human_in_loop IS NULL;
      COMMENT ON COLUMN agents.pending_config IS NULL;
      COMMENT ON COLUMN agents.metadata IS NULL;
      COMMENT ON COLUMN agents.created_at IS NULL;
      COMMENT ON COLUMN agents.updated_at IS NULL;

      COMMENT ON TABLE organization_audit_logs IS NULL;
      COMMENT ON COLUMN organization_audit_logs.id IS NULL;
      COMMENT ON COLUMN organization_audit_logs.company_id IS NULL;
      COMMENT ON COLUMN organization_audit_logs.user_id IS NULL;
      COMMENT ON COLUMN organization_audit_logs.node_id IS NULL;
      COMMENT ON COLUMN organization_audit_logs.action IS NULL;
      COMMENT ON COLUMN organization_audit_logs.before_state IS NULL;
      COMMENT ON COLUMN organization_audit_logs.after_state IS NULL;
      COMMENT ON COLUMN organization_audit_logs.created_at IS NULL;

      COMMENT ON TABLE organization_nodes IS NULL;
      COMMENT ON COLUMN organization_nodes.id IS NULL;
      COMMENT ON COLUMN organization_nodes.company_id IS NULL;
      COMMENT ON COLUMN organization_nodes.parent_id IS NULL;
      COMMENT ON COLUMN organization_nodes.type IS NULL;
      COMMENT ON COLUMN organization_nodes.name IS NULL;
      COMMENT ON COLUMN organization_nodes.description IS NULL;
      COMMENT ON COLUMN organization_nodes.agent_id IS NULL;
      COMMENT ON COLUMN organization_nodes.order_no IS NULL;
      COMMENT ON COLUMN organization_nodes.metadata IS NULL;
      COMMENT ON COLUMN organization_nodes.created_at IS NULL;
      COMMENT ON COLUMN organization_nodes.updated_at IS NULL;

      COMMENT ON TABLE company_memberships IS NULL;
      COMMENT ON COLUMN company_memberships.id IS NULL;
      COMMENT ON COLUMN company_memberships.company_id IS NULL;
      COMMENT ON COLUMN company_memberships.user_id IS NULL;
      COMMENT ON COLUMN company_memberships.role IS NULL;
      COMMENT ON COLUMN company_memberships.is_active IS NULL;
      COMMENT ON COLUMN company_memberships.created_at IS NULL;
      COMMENT ON COLUMN company_memberships.updated_at IS NULL;

      COMMENT ON TABLE companies IS NULL;
      COMMENT ON COLUMN companies.id IS NULL;
      COMMENT ON COLUMN companies.name IS NULL;
      COMMENT ON COLUMN companies.industry IS NULL;
      COMMENT ON COLUMN companies.scale IS NULL;
      COMMENT ON COLUMN companies.goal IS NULL;
      COMMENT ON COLUMN companies.initial_budget IS NULL;
      COMMENT ON COLUMN companies.is_active IS NULL;
      COMMENT ON COLUMN companies.created_by IS NULL;
      COMMENT ON COLUMN companies.created_at IS NULL;
      COMMENT ON COLUMN companies.updated_at IS NULL;
      COMMENT ON COLUMN companies.slug IS NULL;
      COMMENT ON COLUMN companies.status IS NULL;
      COMMENT ON COLUMN companies.description IS NULL;
      COMMENT ON COLUMN companies.logo_url IS NULL;
      COMMENT ON COLUMN companies.contact_email IS NULL;
      COMMENT ON COLUMN companies.contact_phone IS NULL;
      COMMENT ON COLUMN companies.timezone IS NULL;
      COMMENT ON COLUMN companies.default_language IS NULL;

      COMMENT ON TABLE audit_logs IS NULL;
      COMMENT ON COLUMN audit_logs.id IS NULL;
      COMMENT ON COLUMN audit_logs.request_id IS NULL;
      COMMENT ON COLUMN audit_logs.user_id IS NULL;
      COMMENT ON COLUMN audit_logs.api_key_id IS NULL;
      COMMENT ON COLUMN audit_logs.company_id IS NULL;
      COMMENT ON COLUMN audit_logs.service IS NULL;
      COMMENT ON COLUMN audit_logs.method IS NULL;
      COMMENT ON COLUMN audit_logs.path IS NULL;
      COMMENT ON COLUMN audit_logs.status_code IS NULL;
      COMMENT ON COLUMN audit_logs.request_headers IS NULL;
      COMMENT ON COLUMN audit_logs.request_body IS NULL;
      COMMENT ON COLUMN audit_logs.response_body IS NULL;
      COMMENT ON COLUMN audit_logs.client_ip IS NULL;
      COMMENT ON COLUMN audit_logs.user_agent IS NULL;
      COMMENT ON COLUMN audit_logs.duration_ms IS NULL;
      COMMENT ON COLUMN audit_logs.error_message IS NULL;
      COMMENT ON COLUMN audit_logs.created_at IS NULL;

      COMMENT ON TABLE routes IS NULL;
      COMMENT ON COLUMN routes.id IS NULL;
      COMMENT ON COLUMN routes.path IS NULL;
      COMMENT ON COLUMN routes.service IS NULL;
      COMMENT ON COLUMN routes.rewrite_path IS NULL;
      COMMENT ON COLUMN routes.auth_required IS NULL;
      COMMENT ON COLUMN routes.is_active IS NULL;
      COMMENT ON COLUMN routes.priority IS NULL;
      COMMENT ON COLUMN routes.description IS NULL;
      COMMENT ON COLUMN routes.created_at IS NULL;
      COMMENT ON COLUMN routes.updated_at IS NULL;
      COMMENT ON COLUMN routes.transport IS NULL;
      COMMENT ON COLUMN routes.rpc_client_name IS NULL;
      COMMENT ON COLUMN routes.rpc_pattern IS NULL;
      COMMENT ON COLUMN routes.rpc_timeout_ms IS NULL;

      COMMENT ON TABLE api_keys IS NULL;
      COMMENT ON COLUMN api_keys.id IS NULL;
      COMMENT ON COLUMN api_keys.key_id IS NULL;
      COMMENT ON COLUMN api_keys.key_hash IS NULL;
      COMMENT ON COLUMN api_keys.name IS NULL;
      COMMENT ON COLUMN api_keys.description IS NULL;
      COMMENT ON COLUMN api_keys.permissions IS NULL;
      COMMENT ON COLUMN api_keys.expires_at IS NULL;
      COMMENT ON COLUMN api_keys.is_active IS NULL;
      COMMENT ON COLUMN api_keys.created_at IS NULL;
      COMMENT ON COLUMN api_keys.updated_at IS NULL;

      COMMENT ON TABLE "oauth_accounts" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."id" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."userId" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."provider" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."providerUserId" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."providerUsername" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."accessToken" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."refreshToken" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."expiresAt" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."profileData" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."createdAt" IS NULL;
      COMMENT ON COLUMN "oauth_accounts"."updatedAt" IS NULL;

      COMMENT ON TABLE "users" IS NULL;
      COMMENT ON COLUMN "users"."id" IS NULL;
      COMMENT ON COLUMN "users"."username" IS NULL;
      COMMENT ON COLUMN "users"."email" IS NULL;
      COMMENT ON COLUMN "users"."passwordHash" IS NULL;
      COMMENT ON COLUMN "users"."roles" IS NULL;
      COMMENT ON COLUMN "users"."permissions" IS NULL;
      COMMENT ON COLUMN "users"."enabled" IS NULL;
      COMMENT ON COLUMN "users"."lastLoginAt" IS NULL;
      COMMENT ON COLUMN "users"."createdAt" IS NULL;
      COMMENT ON COLUMN "users"."updatedAt" IS NULL;
      COMMENT ON COLUMN "users"."deletedAt" IS NULL;
    `);
  }
}
