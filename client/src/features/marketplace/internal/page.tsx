import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Star,
  Clock,
  Users,
  Play,
  X,
  ChevronRight,
  Check,
  Bot,
  BarChart3,
  PenTool,
  Headphones,
  Calculator,
  Settings,
  TrendingUp,
  Zap,
} from "lucide-react";

/* ─── 类型定义 ─── */

type SkillCategory = "all" | "data-analysis" | "content-creation" | "customer-service" | "finance" | "operations";
type WorkflowCategory = "all" | "marketing" | "sales" | "operations" | "finance" | "hr";

interface SkillModule {
  id: string;
  name: string;
  icon: typeof BarChart3;
  agent: string;
  description: string;
  callCount: number;
  rating: number;
  category: SkillCategory;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  agentCount: number;
  estimatedDuration: string;
  usageCount: number;
  category: WorkflowCategory;
  steps: { agent: string; action: string }[];
}

/* ─── 配置 ─── */

const skillCategories: { value: SkillCategory; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "data-analysis", label: "数据分析" },
  { value: "content-creation", label: "内容创作" },
  { value: "customer-service", label: "客户服务" },
  { value: "finance", label: "财务" },
  { value: "operations", label: "运营" },
];

const workflowCategories: { value: WorkflowCategory; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "marketing", label: "市场" },
  { value: "sales", label: "销售" },
  { value: "operations", label: "运营" },
  { value: "finance", label: "财务" },
  { value: "hr", label: "HR" },
];

/* ─── Mock 数据：能力模块 ─── */

const MOCK_SKILLS: SkillModule[] = [
  { id: "S001", name: "竞品分析", icon: TrendingUp, agent: "市场分析师", description: "自动采集竞品数据，生成对比分析报告", callCount: 1247, rating: 4.8, category: "data-analysis" },
  { id: "S002", name: "数据可视化", icon: BarChart3, agent: "数据工程师", description: "将原始数据转化为直观的图表和仪表盘", callCount: 892, rating: 4.6, category: "data-analysis" },
  { id: "S003", name: "内容生成", icon: PenTool, agent: "内容创作者", description: "基于主题自动生成文章、社交媒体文案", callCount: 2156, rating: 4.9, category: "content-creation" },
  { id: "S004", name: "工单自动回复", icon: Headphones, agent: "客服专员", description: "智能识别客户问题并生成标准回复", callCount: 3421, rating: 4.7, category: "customer-service" },
  { id: "S005", name: "财务报表生成", icon: Calculator, agent: "财务分析师", description: "自动汇总数据生成月度/季度财务报表", callCount: 456, rating: 4.5, category: "finance" },
  { id: "S006", name: "流程自动化", icon: Settings, agent: "运营经理", description: "将重复性业务流程转化为自动化工作流", callCount: 678, rating: 4.4, category: "operations" },
  { id: "S007", name: "用户画像分析", icon: Users, agent: "市场分析师", description: "基于行为数据构建精准用户画像", callCount: 534, rating: 4.3, category: "data-analysis" },
  { id: "S008", name: "SEO 优化建议", icon: TrendingUp, agent: "内容创作者", description: "分析关键词并提供内容优化建议", callCount: 789, rating: 4.6, category: "content-creation" },
  { id: "S009", name: "满意度分析", icon: Star, agent: "客服专员", description: "自动分析客户反馈生成满意度报告", callCount: 345, rating: 4.2, category: "customer-service" },
  { id: "S010", name: "预算追踪", icon: Calculator, agent: "财务分析师", description: "实时监控预算执行情况并预警超支", callCount: 234, rating: 4.4, category: "finance" },
  { id: "S011", name: "供应链监控", icon: Settings, agent: "运营经理", description: "监控供应商交付和库存状态", callCount: 456, rating: 4.1, category: "operations" },
  { id: "S012", name: "邮件营销", icon: PenTool, agent: "内容创作者", description: "自动生成个性化营销邮件内容", callCount: 1023, rating: 4.7, category: "content-creation" },
];

/* ─── Mock 数据：工作流模版 ─── */

const MOCK_WORKFLOWS: WorkflowTemplate[] = [
  {
    id: "W001", name: "新品发布营销", description: "从产品定位到市场推广的全流程自动化", agentCount: 4, estimatedDuration: "2-3 天", usageCount: 89, category: "marketing",
    steps: [
      { agent: "市场分析师", action: "分析目标市场和竞品定位" },
      { agent: "内容创作者", action: "生成营销文案和素材" },
      { agent: "运营经理", action: "制定发布计划和渠道策略" },
      { agent: "数据工程师", action: "设置效果追踪和数据看板" },
    ],
  },
  {
    id: "W002", name: "客户入职流程", description: "新客户签约后的自动化入职服务", agentCount: 3, estimatedDuration: "1 天", usageCount: 156, category: "sales",
    steps: [
      { agent: "客服专员", action: "发送欢迎邮件和入职指引" },
      { agent: "运营经理", action: "创建客户专属工作空间" },
      { agent: "数据工程师", action: "初始化客户数据看板" },
    ],
  },
  {
    id: "W003", name: "月度运营报告", description: "自动生成公司月度运营综合报告", agentCount: 5, estimatedDuration: "3-4 小时", usageCount: 234, category: "operations",
    steps: [
      { agent: "数据工程师", action: "采集各业务线数据" },
      { agent: "财务分析师", action: "生成财务分析部分" },
      { agent: "市场分析师", action: "生成市场趋势分析" },
      { agent: "客服专员", action: "汇总客户反馈数据" },
      { agent: "内容创作者", action: "整合生成最终报告" },
    ],
  },
  {
    id: "W004", name: "供应商评估", description: "新供应商准入的标准化评估流程", agentCount: 3, estimatedDuration: "1-2 天", usageCount: 67, category: "operations",
    steps: [
      { agent: "运营经理", action: "收集供应商资质文件" },
      { agent: "财务分析师", action: "评估报价和付款条款" },
      { agent: "数据工程师", action: "生成评估对比报告" },
    ],
  },
  {
    id: "W005", name: "季度预算规划", description: "基于历史数据的季度预算自动规划", agentCount: 2, estimatedDuration: "2-3 小时", usageCount: 45, category: "finance",
    steps: [
      { agent: "数据工程师", action: "提取历史支出数据" },
      { agent: "财务分析师", action: "生成预算建议方案" },
    ],
  },
  {
    id: "W006", name: "招聘流程自动化", description: "从职位发布到候选人筛选的全流程", agentCount: 3, estimatedDuration: "持续进行", usageCount: 123, category: "hr",
    steps: [
      { agent: "内容创作者", action: "生成职位描述和招聘文案" },
      { agent: "运营经理", action: "发布到各招聘渠道" },
      { agent: "数据工程师", action: "筛选和排名候选人" },
    ],
  },
  {
    id: "W007", name: "社交媒体运营", description: "多平台社交媒体内容的自动排期发布", agentCount: 2, estimatedDuration: "每周 2 小时", usageCount: 312, category: "marketing",
    steps: [
      { agent: "内容创作者", action: "生成一周内容计划" },
      { agent: "运营经理", action: "排期发布并监控互动" },
    ],
  },
  {
    id: "W008", name: "销售线索培育", description: "自动化跟进和培育潜在客户", agentCount: 3, estimatedDuration: "持续进行", usageCount: 178, category: "sales",
    steps: [
      { agent: "市场分析师", action: "分析线索质量和意向" },
      { agent: "内容创作者", action: "生成个性化跟进内容" },
      { agent: "客服专员", action: "执行跟进并记录反馈" },
    ],
  },
];

/* ─── 主页面 ─── */

export default function InternalMarketPage() {
  const [activeTab, setActiveTab] = useState<"skills" | "workflows">("skills");

  return (
    <section className="h-full space-y-6 overflow-auto p-4 md:p-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">内部市场</h1>
        <p className="mt-1 text-sm text-gray-500">Internal Market — 公司内部 Agent 能力共享与工作流模版</p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("skills")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "skills" ? "bg-white text-[#1e3a5f] shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          能力模块 / Skills
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("workflows")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "workflows" ? "bg-white text-[#1e3a5f] shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          工作流模版 / Workflows
        </button>
      </div>

      {/* Tab 内容 */}
      {activeTab === "skills" ? <SkillsTab /> : <WorkflowsTab />}
    </section>
  );
}

/* ─── 能力模块 Tab ─── */

function SkillsTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory>("all");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filteredSkills = useMemo(() => {
    return MOCK_SKILLS.filter((skill) => {
      if (selectedCategory !== "all" && skill.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [searchQuery, selectedCategory]);

  const handleAddToAgent = (skillName: string) => {
    setToastMessage(`已将「${skillName}」添加到 Agent`);
    setTimeout(() => setToastMessage(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* 搜索和筛选 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索能力模块..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          {skillCategories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat.value
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 卡片网格 */}
      <div className="grid grid-cols-3 gap-4">
        {filteredSkills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} onAdd={() => handleAddToAgent(skill.name)} />
        ))}
      </div>

      {filteredSkills.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">无匹配的能力模块</div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 rounded-lg bg-green-600 px-4 py-2 text-sm text-white shadow-lg"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── 能力模块卡片 ─── */

function SkillCard({ skill, onAdd }: { skill: SkillModule; onAdd: () => void }) {
  const Icon = skill.icon;
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <motion.div
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
          <Icon className="h-5 w-5 text-[#1e3a5f]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{skill.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{skill.agent}</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-600 leading-relaxed">{skill.description}</p>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {skill.callCount.toLocaleString()} 次
          </span>
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {skill.rating}
          </span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="rounded-lg bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2d5a8e]"
          >
            添加到 Agent
          </button>

          {/* Agent 选择下拉 */}
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 bottom-full mb-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-10"
              >
                {["市场分析师", "内容创作者", "客服专员", "数据工程师"].map((agent) => (
                  <button
                    key={agent}
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      onAdd();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <Bot className="h-3.5 w-3.5 text-gray-400" />
                    {agent}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── 工作流模版 Tab ─── */

function WorkflowsTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<WorkflowCategory>("all");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowTemplate | null>(null);
  const [showDeployConfirm, setShowDeployConfirm] = useState<WorkflowTemplate | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filteredWorkflows = useMemo(() => {
    return MOCK_WORKFLOWS.filter((wf) => {
      if (selectedCategory !== "all" && wf.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!wf.name.toLowerCase().includes(q) && !wf.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [searchQuery, selectedCategory]);

  const handleDeploy = (workflow: WorkflowTemplate) => {
    setShowDeployConfirm(null);
    setToastMessage(`「${workflow.name}」部署成功`);
    setTimeout(() => setToastMessage(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* 搜索和筛选 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索工作流模版..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          {workflowCategories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat.value
                  ? "bg-[#1e3a5f] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 卡片网格 */}
      <div className="grid grid-cols-2 gap-4">
        {filteredWorkflows.map((workflow) => (
          <WorkflowCard
            key={workflow.id}
            workflow={workflow}
            onClick={() => setSelectedWorkflow(workflow)}
            onDeploy={() => setShowDeployConfirm(workflow)}
          />
        ))}
      </div>

      {filteredWorkflows.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">无匹配的工作流模版</div>
      )}

      {/* 详情抽屉 */}
      <WorkflowDrawer workflow={selectedWorkflow} onClose={() => setSelectedWorkflow(null)} />

      {/* 部署确认弹窗 */}
      <AnimatePresence>
        {showDeployConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowDeployConfirm(null)} />
            <motion.div
              className="relative w-96 rounded-xl bg-white p-6 shadow-xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <h3 className="text-lg font-semibold text-gray-900">确认部署</h3>
              <p className="mt-2 text-sm text-gray-500">
                确定要部署「{showDeployConfirm.name}」工作流模版吗？部署后将自动创建相关任务和 Agent 配置。
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeployConfirm(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => handleDeploy(showDeployConfirm)}
                  className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e]"
                >
                  确认部署
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 rounded-lg bg-green-600 px-4 py-2 text-sm text-white shadow-lg"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── 工作流模版卡片 ─── */

function WorkflowCard({ workflow, onClick, onDeploy }: {
  workflow: WorkflowTemplate;
  onClick: () => void;
  onDeploy: () => void;
}) {
  return (
    <motion.div
      className="rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md cursor-pointer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
    >
      <div className="p-5">
        <h3 className="text-base font-semibold text-gray-900">{workflow.name}</h3>
        <p className="mt-2 text-xs text-gray-600 leading-relaxed">{workflow.description}</p>

        <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {workflow.agentCount} 个 Agent
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {workflow.estimatedDuration}
          </span>
          <span className="flex items-center gap-1">
            <Play className="h-3.5 w-3.5" />
            {workflow.usageCount} 次使用
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            点击查看详情
            <ChevronRight className="h-3 w-3" />
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeploy();
            }}
            className="rounded-lg bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2d5a8e]"
          >
            部署
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── 工作流详情抽屉 ─── */

function WorkflowDrawer({ workflow, onClose }: { workflow: WorkflowTemplate | null; onClose: () => void }) {
  if (!workflow) return null;

  return (
    <AnimatePresence>
      {workflow && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <motion.div
            className="relative w-96 bg-white shadow-xl overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="p-6 space-y-6">
              {/* 关闭按钮 */}
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>

              {/* 标题 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{workflow.name}</h3>
                <p className="mt-2 text-sm text-gray-600">{workflow.description}</p>
              </div>

              {/* 统计信息 */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-lg font-bold text-[#1e3a5f]">{workflow.agentCount}</p>
                  <p className="text-xs text-gray-500">Agent 数量</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-lg font-bold text-[#1e3a5f]">{workflow.estimatedDuration}</p>
                  <p className="text-xs text-gray-500">预计时长</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-lg font-bold text-[#1e3a5f]">{workflow.usageCount}</p>
                  <p className="text-xs text-gray-500">使用次数</p>
                </div>
              </div>

              {/* 工作流步骤 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">工作流步骤</h4>
                <div className="space-y-3">
                  {workflow.steps.map((step, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{step.action}</p>
                        <p className="text-xs text-gray-500 mt-0.5">执行者：{step.agent}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
