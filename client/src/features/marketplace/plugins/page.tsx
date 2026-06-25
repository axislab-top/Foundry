import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Star,
  Download,
  Trash2,
  X,
  Check,
  ChevronRight,
  Settings,
  Power,
  Package,
  Globe,
  Mail,
  Database,
  CreditCard,
  Megaphone,
  Code,
  FileStack,
  Zap,
} from "lucide-react";

/* ─── 类型定义 ─── */

type PluginCategory = "all" | "data-analytics" | "communication" | "file-storage" | "payment" | "marketing" | "dev-tools";
type SortBy = "popular" | "newest" | "rating";

interface Plugin {
  id: string;
  name: string;
  developer: string;
  description: string;
  fullDescription: string;
  category: PluginCategory;
  icon: typeof Globe;
  iconBg: string;
  rating: number;
  reviewCount: number;
  price: "free" | number;
  installed: boolean;
  enabled: boolean;
  features: string[];
  supportedAgents: string[];
  version: string;
  changelog: { version: string; date: string; description: string }[];
  reviews: { user: string; rating: number; comment: string }[];
}

/* ─── 配置 ─── */

const categories: { value: PluginCategory; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "data-analytics", label: "数据与分析" },
  { value: "communication", label: "通信" },
  { value: "file-storage", label: "文件存储" },
  { value: "payment", label: "支付" },
  { value: "marketing", label: "营销" },
  { value: "dev-tools", label: "开发工具" },
];

/* ─── Mock 数据 ─── */

const MOCK_PLUGINS: Plugin[] = [
  {
    id: "P001", name: "Google Analytics", developer: "Google", description: "网站流量分析与用户行为追踪", fullDescription: "Google Analytics 是全球领先的网站分析工具，帮助您了解访客来源、行为路径和转化率。通过与 Agent 集成，可以自动生成流量报告和优化建议。",
    category: "data-analytics", icon: Globe, iconBg: "bg-orange-100", rating: 4.8, reviewCount: 12450, price: "free", installed: true, enabled: true,
    features: ["实时流量监控", "用户行为追踪", "转化漏斗分析", "自定义报告", "API 数据导出"],
    supportedAgents: ["数据工程师", "市场分析师", "运营经理"],
    version: "3.2.1", changelog: [{ version: "3.2.1", date: "2026-05-01", description: "修复了数据同步延迟问题" }, { version: "3.2.0", date: "2026-04-15", description: "新增自定义维度支持" }],
    reviews: [{ user: "创业者小李", rating: 5, comment: "数据非常准确，帮我找到了流量增长的关键点" }, { user: "产品经理张先生", rating: 4, comment: "功能强大，但学习曲线有点陡" }, { user: "运营达人", rating: 5, comment: "必备工具，强烈推荐" }],
  },
  {
    id: "P002", name: "Slack", developer: "Salesforce", description: "团队协作与即时通讯集成", fullDescription: "将 Agent 通知和任务更新推送到 Slack 频道，实现团队协作无缝衔接。支持消息模板、@提及和文件分享。",
    category: "communication", icon: Megaphone, iconBg: "bg-purple-100", rating: 4.7, reviewCount: 8920, price: "free", installed: true, enabled: true,
    features: ["消息推送", "频道管理", "文件分享", "@提及支持", "消息模板"],
    supportedAgents: ["客服专员", "运营经理", "内容创作者"],
    version: "2.1.0", changelog: [{ version: "2.1.0", date: "2026-04-20", description: "支持线程回复" }, { version: "2.0.5", date: "2026-04-01", description: "性能优化" }],
    reviews: [{ user: "技术负责人", rating: 5, comment: "团队沟通效率提升明显" }, { user: "项目经理", rating: 4, comment: "集成简单，功能实用" }, { user: "创业者", rating: 5, comment: "省去了很多手动通知的工作" }],
  },
  {
    id: "P003", name: "Stripe", developer: "Stripe Inc.", description: "在线支付处理与订阅管理", fullDescription: "Stripe 提供安全可靠的在线支付解决方案，支持信用卡、借记卡和多种本地支付方式。与 Agent 集成后可自动化处理退款、订阅管理和财务报告。",
    category: "payment", icon: CreditCard, iconBg: "bg-indigo-100", rating: 4.9, reviewCount: 15680, price: 29, installed: true, enabled: true,
    features: ["多种支付方式", "订阅管理", "退款处理", "欺诈检测", "财务报告"],
    supportedAgents: ["财务分析师", "客服专员", "运营经理"],
    version: "4.0.2", changelog: [{ version: "4.0.2", date: "2026-05-10", description: "新增 Apple Pay 支持" }, { version: "4.0.0", date: "2026-04-01", description: "重大版本升级，API v4" }],
    reviews: [{ user: "电商老板", rating: 5, comment: "支付成功率提升了很多" }, { user: "SaaS 创业者", rating: 5, comment: "订阅管理非常方便" }, { user: "财务经理", rating: 4, comment: "报表功能强大" }],
  },
  {
    id: "P004", name: "AWS S3", developer: "Amazon", description: "云存储服务，安全存储和检索文件", fullDescription: "Amazon S3 提供高可用、高耐久性的对象存储服务。与 Agent 集成后可自动化文件备份、归档和分发。",
    category: "file-storage", icon: Database, iconBg: "bg-yellow-100", rating: 4.6, reviewCount: 9870, price: "free", installed: true, enabled: true,
    features: ["无限存储容量", "99.999999999% 耐久性", "版本控制", "访问控制", "生命周期管理"],
    supportedAgents: ["数据工程师", "运营经理"],
    version: "2.3.0", changelog: [{ version: "2.3.0", date: "2026-04-25", description: "新增智能分层功能" }, { version: "2.2.8", date: "2026-04-10", description: "修复上传大文件的问题" }],
    reviews: [{ user: "开发者", rating: 5, comment: "稳定可靠，性能出色" }, { user: "运维工程师", rating: 4, comment: "配置有点复杂" }, { user: "创业公司", rating: 5, comment: "性价比很高" }],
  },
  {
    id: "P005", name: "Mailchimp", developer: "Intuit", description: "邮件营销自动化平台", fullDescription: "Mailchimp 是全球领先的邮件营销平台，帮助您设计、发送和分析邮件营销活动。与 Agent 集成后可自动化邮件列表管理和活动执行。",
    category: "marketing", icon: Mail, iconBg: "bg-green-100", rating: 4.5, reviewCount: 6540, price: 19, installed: false, enabled: false,
    features: ["邮件模板", "自动化工作流", "A/B 测试", "受众细分", "效果分析"],
    supportedAgents: ["内容创作者", "市场分析师", "运营经理"],
    version: "1.8.5", changelog: [{ version: "1.8.5", date: "2026-05-05", description: "新增 AI 内容建议" }, { version: "1.8.0", date: "2026-04-20", description: "优化发送速度" }],
    reviews: [{ user: "市场经理", rating: 5, comment: "邮件打开率提升 30%" }, { user: "电商运营", rating: 4, comment: "模板丰富，易于使用" }, { user: "创业者", rating: 4, comment: "性价比不错" }],
  },
  {
    id: "P006", name: "GitHub", developer: "Microsoft", description: "代码托管与版本控制", fullDescription: "GitHub 是全球最大的代码托管平台，与 Agent 集成后可自动化代码审查、Issue 管理和 CI/CD 流程。",
    category: "dev-tools", icon: Code, iconBg: "bg-gray-100", rating: 4.8, reviewCount: 23450, price: "free", installed: false, enabled: false,
    features: ["代码托管", "Pull Request", "Issue 管理", "GitHub Actions", "代码审查"],
    supportedAgents: ["数据工程师", "运营经理"],
    version: "3.1.0", changelog: [{ version: "3.1.0", date: "2026-05-08", description: "支持 Copilot 集成" }, { version: "3.0.0", date: "2026-04-01", description: "全新 API 架构" }],
    reviews: [{ user: "开发者", rating: 5, comment: "不可或缺的开发工具" }, { user: "技术负责人", rating: 5, comment: "代码管理效率大幅提升" }, { user: "开源贡献者", rating: 4, comment: "功能强大" }],
  },
  {
    id: "P007", name: "Zapier", developer: "Zapier Inc.", description: "自动化工作流连接器", fullDescription: "Zapier 可以连接 5000+ 应用，创建自动化工作流。与 Agent 集成后可扩展 Agent 的外部连接能力。",
    category: "dev-tools", icon: Zap, iconBg: "bg-orange-100", rating: 4.4, reviewCount: 7890, price: 29, installed: false, enabled: false,
    features: ["5000+ 应用连接", "可视化工作流", "条件逻辑", "定时触发", "错误处理"],
    supportedAgents: ["运营经理", "数据工程师", "内容创作者"],
    version: "2.0.0", changelog: [{ version: "2.0.0", date: "2026-04-15", description: "全新工作流编辑器" }, { version: "1.9.5", date: "2026-04-01", description: "新增 100+ 应用" }],
    reviews: [{ user: "运营经理", rating: 5, comment: "自动化神器" }, { user: "创业者", rating: 4, comment: "节省大量时间" }, { user: "产品经理", rating: 4, comment: "配置灵活" }],
  },
  {
    id: "P008", name: "Notion", developer: "Notion Labs", description: "知识库与项目管理", fullDescription: "Notion 是全能型知识管理和项目管理工具。与 Agent 集成后可自动化文档更新、任务创建和知识库维护。",
    category: "file-storage", icon: FileStack, iconBg: "bg-black/10", rating: 4.7, reviewCount: 11230, price: "free", installed: false, enabled: false,
    features: ["文档管理", "数据库", "看板视图", "模板库", "API 集成"],
    supportedAgents: ["内容创作者", "运营经理", "产品经理"],
    version: "1.5.2", changelog: [{ version: "1.5.2", date: "2026-05-03", description: "修复同步问题" }, { version: "1.5.0", date: "2026-04-18", description: "新增 AI 写作助手" }],
    reviews: [{ user: "内容创作者", rating: 5, comment: "知识管理的最佳工具" }, { user: "项目经理", rating: 4, comment: "功能全面" }, { user: "团队负责人", rating: 5, comment: "协作效率提升明显" }],
  },
  {
    id: "P009", name: "Twilio", developer: "Twilio Inc.", description: "短信与语音通信服务", fullDescription: "Twilio 提供可靠的短信、语音和视频通信 API。与 Agent 集成后可自动化客户通知和电话营销。",
    category: "communication", icon: Megaphone, iconBg: "bg-red-100", rating: 4.6, reviewCount: 5670, price: 15, installed: false, enabled: false,
    features: ["短信发送", "语音通话", "WhatsApp 消息", "号码验证", "通话录音"],
    supportedAgents: ["客服专员", "市场分析师", "运营经理"],
    version: "2.2.0", changelog: [{ version: "2.2.0", date: "2026-04-28", description: "新增 RCS 消息支持" }, { version: "2.1.5", date: "2026-04-10", description: "优化发送速度" }],
    reviews: [{ user: "客服经理", rating: 5, comment: "通知到达率很高" }, { user: "电商运营", rating: 4, comment: "集成简单" }, { user: "创业者", rating: 4, comment: "价格合理" }],
  },
  {
    id: "P010", name: "Google Sheets", developer: "Google", description: "在线表格与数据协作", fullDescription: "Google Sheets 是在线电子表格工具，支持实时协作。与 Agent 集成后可自动化数据录入、报表生成和数据分析。",
    category: "data-analytics", icon: Database, iconBg: "bg-green-100", rating: 4.5, reviewCount: 8900, price: "free", installed: false, enabled: false,
    features: ["实时协作", "公式计算", "图表生成", "数据透视表", "API 访问"],
    supportedAgents: ["数据工程师", "财务分析师", "运营经理"],
    version: "1.3.0", changelog: [{ version: "1.3.0", date: "2026-05-02", description: "新增智能填充功能" }, { version: "1.2.5", date: "2026-04-15", description: "性能优化" }],
    reviews: [{ user: "数据分析师", rating: 5, comment: "协作非常方便" }, { user: "财务人员", rating: 4, comment: "公式功能强大" }, { user: "运营经理", rating: 4, comment: "数据可视化不错" }],
  },
  {
    id: "P011", name: "Shopify", developer: "Shopify Inc.", description: "电商平台集成", fullDescription: "Shopify 是全球领先的电商平台。与 Agent 集成后可自动化订单管理、库存同步和客户服务。",
    category: "payment", icon: CreditCard, iconBg: "bg-green-100", rating: 4.7, reviewCount: 12340, price: 39, installed: false, enabled: false,
    features: ["订单管理", "库存同步", "客户数据", "产品管理", "销售分析"],
    supportedAgents: ["客服专员", "运营经理", "财务分析师"],
    version: "2.5.0", changelog: [{ version: "2.5.0", date: "2026-04-30", description: "新增多店铺管理" }, { version: "2.4.0", date: "2026-04-12", description: "优化 API 性能" }],
    reviews: [{ user: "电商老板", rating: 5, comment: "管理效率提升明显" }, { user: "运营经理", rating: 4, comment: "功能全面" }, { user: "创业者", rating: 5, comment: "扩展性强" }],
  },
  {
    id: "P012", name: "HubSpot", developer: "HubSpot Inc.", description: "CRM 与营销自动化", fullDescription: "HubSpot 是领先的 CRM 和营销自动化平台。与 Agent 集成后可自动化线索管理、邮件营销和客户跟进。",
    category: "marketing", icon: Megaphone, iconBg: "bg-orange-100", rating: 4.6, reviewCount: 9870, price: 49, installed: false, enabled: false,
    features: ["CRM 管理", "邮件营销", "线索评分", "销售管道", "分析报告"],
    supportedAgents: ["市场分析师", "客服专员", "内容创作者"],
    version: "3.0.0", changelog: [{ version: "3.0.0", date: "2026-05-01", description: "全新 CRM 界面" }, { version: "2.9.0", date: "2026-04-15", description: "新增 AI 线索评分" }],
    reviews: [{ user: "市场总监", rating: 5, comment: "营销自动化效果显著" }, { user: "销售经理", rating: 4, comment: "线索管理很方便" }, { user: "创业者", rating: 4, comment: "功能丰富" }],
  },
  {
    id: "P013", name: "PostgreSQL", developer: "PostgreSQL", description: "开源关系型数据库", fullDescription: "PostgreSQL 是最先进的开源关系型数据库。与 Agent 集成后可自动化数据查询、备份和性能监控。",
    category: "data-analytics", icon: Database, iconBg: "bg-blue-100", rating: 4.8, reviewCount: 6780, price: "free", installed: false, enabled: false,
    features: ["ACID 事务", "JSON 支持", "全文搜索", "复制功能", "扩展性强"],
    supportedAgents: ["数据工程师"],
    version: "16.2", changelog: [{ version: "16.2", date: "2026-04-20", description: "性能优化" }, { version: "16.0", date: "2026-03-01", description: "新版本发布" }],
    reviews: [{ user: "DBA", rating: 5, comment: "最可靠的数据库" }, { user: "后端开发者", rating: 5, comment: "功能强大" }, { user: "架构师", rating: 4, comment: "扩展性出色" }],
  },
  {
    id: "P014", name: "SendGrid", developer: "Twilio Inc.", description: "邮件发送服务", fullDescription: "SendGrid 是可靠的邮件发送服务，支持事务邮件和营销邮件。与 Agent 集成后可自动化邮件发送和追踪。",
    category: "communication", icon: Mail, iconBg: "bg-blue-100", rating: 4.4, reviewCount: 4560, price: 15, installed: false, enabled: false,
    features: ["高送达率", "邮件模板", "发送分析", "Webhook", "API 集成"],
    supportedAgents: ["内容创作者", "客服专员", "运营经理"],
    version: "1.8.0", changelog: [{ version: "1.8.0", date: "2026-04-25", description: "新增 AI 内容优化" }, { version: "1.7.5", date: "2026-04-10", description: "修复模板问题" }],
    reviews: [{ user: "开发者", rating: 4, comment: "API 简单易用" }, { user: "市场经理", rating: 5, comment: "送达率很高" }, { user: "创业者", rating: 4, comment: "价格合理" }],
  },
  {
    id: "P015", name: "Dropbox", developer: "Dropbox Inc.", description: "云文件同步与共享", fullDescription: "Dropbox 是流行的云存储和文件同步服务。与 Agent 集成后可自动化文件备份、共享和版本管理。",
    category: "file-storage", icon: FileStack, iconBg: "bg-blue-100", rating: 4.3, reviewCount: 7890, price: 12, installed: false, enabled: false,
    features: ["文件同步", "版本历史", "共享链接", "团队文件夹", "API 集成"],
    supportedAgents: ["运营经理", "内容创作者"],
    version: "2.1.0", changelog: [{ version: "2.1.0", date: "2026-04-22", description: "新增智能搜索" }, { version: "2.0.5", date: "2026-04-05", description: "性能优化" }],
    reviews: [{ user: "设计师", rating: 4, comment: "文件同步很方便" }, { user: "项目经理", rating: 4, comment: "团队协作好帮手" }, { user: "创业者", rating: 3, comment: "空间有点小" }],
  },
  {
    id: "P016", name: "Vercel", developer: "Vercel Inc.", description: "前端部署与托管平台", fullDescription: "Vercel 是现代前端应用的部署和托管平台。与 Agent 集成后可自动化部署流程和性能监控。",
    category: "dev-tools", icon: Code, iconBg: "bg-black/10", rating: 4.7, reviewCount: 5430, price: "free", installed: false, enabled: false,
    features: ["一键部署", "边缘网络", "自动 HTTPS", "预览部署", "分析仪表盘"],
    supportedAgents: ["数据工程师", "运营经理"],
    version: "1.5.0", changelog: [{ version: "1.5.0", date: "2026-05-06", description: "新增 AI 代码优化" }, { version: "1.4.0", date: "2026-04-18", description: "支持更多框架" }],
    reviews: [{ user: "前端开发者", rating: 5, comment: "部署体验一流" }, { user: "全栈开发者", rating: 5, comment: "性能出色" }, { user: "创业者", rating: 4, comment: "免费额度够用" }],
  },
];

/* ─── 主页面 ─── */

export default function PluginStorePage() {
  const [plugins, setPlugins] = useState(MOCK_PLUGINS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<PluginCategory>("all");
  const [sortBy, setSortBy] = useState<SortBy>("popular");
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [showInstallConfirm, setShowInstallConfirm] = useState<Plugin | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showInstalledPanel, setShowInstalledPanel] = useState(true);

  const filteredPlugins = useMemo(() => {
    let result = plugins.filter((p) => {
      if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "popular") return b.reviewCount - a.reviewCount;
      if (sortBy === "rating") return b.rating - a.rating;
      return 0; // newest - mock data doesn't have date, keep original order
    });

    return result;
  }, [plugins, searchQuery, selectedCategory, sortBy]);

  const installedPlugins = useMemo(() => plugins.filter((p) => p.installed), [plugins]);
  const installedCount = installedPlugins.length;

  const handleInstall = (plugin: Plugin) => {
    setPlugins((prev) => prev.map((p) => p.id === plugin.id ? { ...p, installed: true, enabled: true } : p));
    setShowInstallConfirm(null);
    setToastMessage(`「${plugin.name}」安装成功`);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleUninstall = (plugin: Plugin) => {
    setPlugins((prev) => prev.map((p) => p.id === plugin.id ? { ...p, installed: false, enabled: false } : p));
    setToastMessage(`「${plugin.name}」已卸载`);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleToggleEnabled = (pluginId: string) => {
    setPlugins((prev) => prev.map((p) => p.id === pluginId ? { ...p, enabled: !p.enabled } : p));
  };

  return (
    <section className="flex gap-4 h-[calc(100vh-120px)]">
      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 space-y-4 overflow-y-auto">
        {/* 顶部横幅 */}
        <div className="rounded-xl bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8e] p-6 text-white">
          <h1 className="text-2xl font-bold">插件商城</h1>
          <p className="mt-1 text-sm text-blue-100">Plugin Store — 为你的 Agent 团队扩展无限能力</p>
          <div className="mt-4 flex items-center gap-2">
            <Package className="h-5 w-5" />
            <span className="text-sm">
              已安装 <span className="font-bold">{installedCount}</span> / {plugins.length} 个插件
            </span>
          </div>
        </div>

        {/* 筛选区 */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索插件..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 flex-1 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setSelectedCategory(cat.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.value
                    ? "bg-[#1e3a5f] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="popular">最热门</option>
            <option value="newest">最新</option>
            <option value="rating">评分最高</option>
          </select>
        </div>

        {/* 插件卡片网格 */}
        <div className="grid grid-cols-3 gap-4 pb-4">
          {filteredPlugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              onClick={() => setSelectedPlugin(plugin)}
              onInstall={() => setShowInstallConfirm(plugin)}
              onUninstall={() => handleUninstall(plugin)}
            />
          ))}
        </div>

        {filteredPlugins.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">无匹配的插件</div>
        )}
      </div>

      {/* 已安装快捷面板 */}
      {showInstalledPanel && (
        <div className="w-56 shrink-0 rounded-xl border border-gray-200 bg-white p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">已安装</h3>
            <button
              type="button"
              onClick={() => setShowInstalledPanel(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            {installedPlugins.map((plugin) => {
              const Icon = plugin.icon;
              return (
                <div key={plugin.id} className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${plugin.iconBg}`}>
                    <Icon className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{plugin.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(plugin.id)}
                    className={`shrink-0 ${plugin.enabled ? "text-green-500" : "text-gray-300"}`}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            {installedPlugins.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">暂无已安装插件</p>
            )}
          </div>
        </div>
      )}

      {/* 折叠时的展开按钮 */}
      {!showInstalledPanel && (
        <button
          type="button"
          onClick={() => setShowInstalledPanel(true)}
          className="shrink-0 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 self-start"
        >
          <Package className="h-4 w-4" />
          已安装 ({installedCount})
        </button>
      )}

      {/* 插件详情抽屉 */}
      <PluginDrawer
        plugin={selectedPlugin}
        onClose={() => setSelectedPlugin(null)}
        onInstall={(p) => { setSelectedPlugin(null); setShowInstallConfirm(p); }}
        onUninstall={handleUninstall}
      />

      {/* 安装确认弹窗 */}
      <AnimatePresence>
        {showInstallConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowInstallConfirm(null)} />
            <motion.div
              className="relative w-96 rounded-xl bg-white p-6 shadow-xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <h3 className="text-lg font-semibold text-gray-900">安装插件</h3>
              <p className="mt-2 text-sm text-gray-500">
                确定要安装「{showInstallConfirm.name}」吗？
              </p>
              <div className="mt-4 rounded-lg bg-gray-50 p-3">
                <h4 className="text-xs font-semibold text-gray-600 mb-2">插件权限</h4>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2 text-xs text-gray-500">
                    <Check className="h-3 w-3 text-green-500" />
                    读取 Agent 配置信息
                  </li>
                  <li className="flex items-center gap-2 text-xs text-gray-500">
                    <Check className="h-3 w-3 text-green-500" />
                    接收任务执行事件
                  </li>
                  <li className="flex items-center gap-2 text-xs text-gray-500">
                    <Check className="h-3 w-3 text-green-500" />
                    返回处理结果
                  </li>
                </ul>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowInstallConfirm(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => handleInstall(showInstallConfirm)}
                  className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e]"
                >
                  确认安装
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
    </section>
  );
}

/* ─── 插件卡片 ─── */

function PluginCard({ plugin, onClick, onInstall, onUninstall }: {
  plugin: Plugin;
  onClick: () => void;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  const Icon = plugin.icon;

  return (
    <motion.div
      className="rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md cursor-pointer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${plugin.iconBg}`}>
            <Icon className="h-6 w-6 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">{plugin.name}</h3>
            <p className="text-xs text-gray-500">{plugin.developer}</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-600 leading-relaxed line-clamp-2">{plugin.description}</p>

        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
            {categories.find((c) => c.value === plugin.category)?.label}
          </span>
          <span className="flex items-center gap-0.5 text-xs text-gray-500">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {plugin.rating}
            <span className="text-gray-400">({plugin.reviewCount.toLocaleString()})</span>
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#1e3a5f]">
            {plugin.price === "free" ? "免费" : `$${plugin.price}/月`}
          </span>
          {plugin.installed ? (
            <div className="flex items-center gap-1">
              <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs text-green-600">
                <Check className="h-3 w-3" />
                已安装
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onUninstall(); }}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onInstall(); }}
              className="rounded-lg bg-[#1e3a5f] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2d5a8e]"
            >
              安装
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── 插件详情抽屉 ─── */

function PluginDrawer({ plugin, onClose, onInstall, onUninstall }: {
  plugin: Plugin | null;
  onClose: () => void;
  onInstall: (p: Plugin) => void;
  onUninstall: (p: Plugin) => void;
}) {
  if (!plugin) return null;

  const Icon = plugin.icon;

  return (
    <AnimatePresence>
      {plugin && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={onClose} />
          <motion.div
            className="relative w-[480px] bg-white shadow-xl overflow-y-auto"
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

              {/* 插件头部 */}
              <div className="flex items-start gap-4">
                <div className={`flex h-16 w-16 items-center justify-center rounded-xl ${plugin.iconBg}`}>
                  <Icon className="h-8 w-8 text-gray-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{plugin.name}</h3>
                  <p className="text-sm text-gray-500">{plugin.developer}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-sm">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      {plugin.rating}
                    </span>
                    <span className="text-sm text-gray-400">{plugin.reviewCount.toLocaleString()} 评价</span>
                    <span className="text-sm font-semibold text-[#1e3a5f]">
                      {plugin.price === "free" ? "免费" : `$${plugin.price}/月`}
                    </span>
                  </div>
                </div>
              </div>

              {/* 完整介绍 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">插件介绍</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{plugin.fullDescription}</p>
              </div>

              {/* 功能特性 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">功能特性</h4>
                <ul className="space-y-2">
                  {plugin.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 支持的 Agent */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">支持的 Agent</h4>
                <div className="flex flex-wrap gap-2">
                  {plugin.supportedAgents.map((agent) => (
                    <span key={agent} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600">
                      {agent}
                    </span>
                  ))}
                </div>
              </div>

              {/* 版本信息 */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>版本：{plugin.version}</span>
              </div>

              {/* 更新日志 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">更新日志</h4>
                <div className="space-y-3">
                  {plugin.changelog.map((log) => (
                    <div key={log.version} className="flex gap-3">
                      <div className="shrink-0">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                          v{log.version}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-0.5">{log.date}</p>
                      </div>
                      <p className="text-xs text-gray-600">{log.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 用户评价 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">用户评价</h4>
                <div className="space-y-3">
                  {plugin.reviews.map((review, index) => (
                    <div key={index} className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700">{review.user}</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3 w-3 ${i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">{review.comment}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3">
                {plugin.installed ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onUninstall(plugin)}
                      className="flex-1 rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50"
                    >
                      卸载插件
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onInstall(plugin)}
                    className="flex-1 rounded-lg bg-[#1e3a5f] py-2.5 text-sm font-medium text-white hover:bg-[#2d5a8e]"
                  >
                    安装插件
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
