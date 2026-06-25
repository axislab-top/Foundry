import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import { Navbar, Footer, fadeUp, staggerContainer, staggerItem } from "./components";

/* ─── Mock 数据 ─── */

const stats = [
  { value: 500, suffix: "+", label: "一人公司", labelEn: "One-Person Companies" },
  { value: 98, suffix: "%", label: "满意度", labelEn: "Satisfaction Rate" },
  { value: 15, suffix: "h", label: "平均节省/周", labelEn: "Avg. Saved per Week" },
];

const cases = [
  {
    id: 1,
    icon: "🎨",
    role: "独立设计师",
    roleEn: "Independent Designer",
    title: "从手动接单到 AI 自动化运营",
    titleEn: "From Manual Orders to AI-Automated Operations",
    summary: "作为独立设计师，过去需要花费大量时间在客户沟通、项目管理和财务核算上。Foundry 让这些交给 AI Agent，专注于创意设计本身。",
    painPoints: [
      "每天花 3 小时回复客户邮件和消息",
      "项目进度难以追踪，经常延期",
      "财务核算混乱，漏开发票",
    ],
    solution: "配置了客服 Agent 处理日常咨询，项目管理 Agent 自动追踪进度并提醒截止日期，财务 Agent 自动生成账单和发票。",
    results: [
      { metric: "每周节省", value: "20 小时" },
      { metric: "客户满意度", value: "提升 35%" },
      { metric: "项目准时率", value: "98%" },
    ],
    quote: "Foundry 让我重新找回了创作的热情，不再被琐事淹没。现在我一个人做的工作量，堪比一个小团队。",
  },
  {
    id: 2,
    icon: "✍️",
    role: "自由撰稿人",
    roleEn: "Freelance Writer",
    title: "AI 助力内容创作效率翻倍",
    titleEn: "AI-Powered Content Creation Doubles Efficiency",
    summary: "自由撰稿人需要同时管理多个客户、多个选题。Foundry 帮我建立了高效的内容生产流水线，从选题到发布全流程自动化。",
    painPoints: [
      "选题灵感枯竭，花大量时间找素材",
      "多客户稿件管理混乱",
      "社交媒体运营占用太多时间",
    ],
    solution: "部署了内容研究 Agent 负责素材搜集和选题建议，社媒运营 Agent 自动排期发布，客户管理 Agent 统一管理稿件进度。",
    results: [
      { metric: "稿件产出", value: "提升 40%" },
      { metric: "社媒粉丝", value: "增长 120%" },
      { metric: "客户续约率", value: "95%" },
    ],
    quote: "以前总觉得一个人做不了太多事，现在有了 AI 团队，能同时服务 10 个客户还不觉得累。",
  },
  {
    id: 3,
    icon: "💻",
    role: "独立开发者",
    roleEn: "Indie Developer",
    title: "一人开发，全公司运营",
    titleEn: "One Developer, Full Company Operations",
    summary: "作为独立开发者，擅长写代码但不擅长运营。Foundry 让我有了市场、客服、财务团队，真正实现了一个人运营一家公司。",
    painPoints: [
      "产品开发和运营难以兼顾",
      "用户反馈处理不及时",
      "缺乏市场推广能力",
    ],
    solution: "配置了市场分析 Agent 监控行业动态，客服 Agent 24 小时处理用户反馈，数据分析 Agent 生成产品优化建议。",
    results: [
      { metric: "用户增长", value: "提升 200%" },
      { metric: "客服响应", value: "< 5 分钟" },
      { metric: "产品迭代", value: "速度翻倍" },
    ],
    quote: "Foundry 是独立开发者的终极武器。它让我能专注于代码，其他事情 AI 全部搞定。",
  },
  {
    id: 4,
    icon: "📚",
    role: "在线教育创业者",
    roleEn: "Online Education Entrepreneur",
    title: "从课程制作到学员管理全自动化",
    titleEn: "Full Automation from Course Creation to Student Management",
    summary: "在线教育需要同时处理课程内容、学员服务、营销推广。Foundry 帮我搭建了完整的自动化运营体系。",
    painPoints: [
      "课程更新和学员答疑占用大量时间",
      "营销活动执行效率低",
      "学员数据分散难以分析",
    ],
    solution: "部署了教学助理 Agent 负责学员答疑，营销 Agent 自动执行推广活动，数据分析 Agent 整合学员行为数据。",
    results: [
      { metric: "学员满意度", value: "提升 45%" },
      { metric: "课程完课率", value: "85%" },
      { metric: "月收入", value: "增长 60%" },
    ],
    quote: "有了 Foundry，终于可以专注于课程质量本身，而不是被运营细节拖垮。",
  },
  {
    id: 5,
    icon: "📦",
    role: "电商独立卖家",
    roleEn: "E-commerce Solo Seller",
    title: "一人管理千单店铺的秘密",
    titleEn: "Secret to Managing a Thousand-Order Store Alone",
    summary: "电商运营涉及选品、上架、客服、物流等多个环节。Foundry 让我一个人就能高效管理日均百单的店铺。",
    painPoints: [
      "客服咨询量大，回复不及时",
      "库存管理混乱，经常断货",
      "竞品分析耗时耗力",
    ],
    solution: "配置了客服 Agent 处理售前售后咨询，库存 Agent 实时监控库存并自动补货提醒，竞品分析 Agent 定期生成报告。",
    results: [
      { metric: "客服效率", value: "提升 300%" },
      { metric: "断货率", value: "降低 90%" },
      { metric: "月销售额", value: "增长 80%" },
    ],
    quote: "以前觉得做到日均百单至少需要 5 个人，现在我一个人加 AI 团队就搞定了。",
  },
  {
    id: 6,
    icon: "📊",
    role: "独立咨询师",
    roleEn: "Independent Consultant",
    title: "AI 让咨询业务规模化",
    titleEn: "AI Scales Consulting Business",
    summary: "咨询师的时间是最宝贵的资源。Foundry 帮我自动化了研究、报告生成和客户管理，让我能服务更多客户。",
    painPoints: [
      "行业研究耗时长",
      "报告撰写重复工作多",
      "客户跟进容易遗漏",
    ],
    solution: "部署了研究 Agent 自动搜集行业数据，报告 Agent 生成初稿，CRM Agent 管理客户关系和跟进提醒。",
    results: [
      { metric: "报告产出", value: "提升 50%" },
      { metric: "客户数量", value: "增长 80%" },
      { metric: "平均收入", value: "增长 120%" },
    ],
    quote: "Foundry 让我的咨询业务实现了规模化，不再受限于个人时间。",
  },
];

/* ─── 主页面 ─── */

export default function CasesPage() {
  const [selectedCase, setSelectedCase] = useState<(typeof cases)[0] | null>(null);

  return (
    <div className="min-h-screen bg-[#000] text-white">
      <Navbar />
      <CasesHeader />
      <CasesGrid onSelect={setSelectedCase} />
      <CTASection />
      <Footer />
      <CaseModal caseData={selectedCase} onClose={() => setSelectedCase(null)} />
    </div>
  );
}

/* ─── 页面标题区 ─── */

function CasesHeader() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16">
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="mx-auto max-w-6xl px-6 text-center">
        <motion.h1
          className="text-4xl font-light tracking-tight sm:text-5xl"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          他们用 Foundry 运营<span className="font-semibold">自己的公司</span>
        </motion.h1>
        <motion.p
          className="mt-2 text-sm text-white/45"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          Real Stories from Real Founders
        </motion.p>
        <motion.p
          className="mt-4 max-w-lg mx-auto text-sm text-white/35"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          来自全球独立创业者的真实案例，看看他们如何用 AI 团队提升效率
        </motion.p>

        {/* 数字亮点 */}
        <div className="mt-12 grid grid-cols-3 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="text-center"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
            >
              <div className="text-4xl font-light tracking-tight">
                {stat.value}
                {stat.suffix}
              </div>
              <p className="mt-1 text-sm text-white/60">{stat.label}</p>
              <p className="text-xs text-white/30">{stat.labelEn}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 案例卡片网格 ─── */

function CasesGrid({
  onSelect,
}: {
  onSelect: (c: (typeof cases)[0]) => void;
}) {
  return (
    <section className="pb-20">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {cases.map((c) => (
            <motion.div
              key={c.id}
              className="border border-white/[0.06] rounded-lg p-6 transition-colors hover:border-white/10"
              variants={staggerItem}
            >
              {/* 用户信息 */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-lg">
                  {c.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{c.role}</p>
                  <p className="text-xs text-white/30">{c.roleEn}</p>
                </div>
              </div>

              {/* 案例标题 */}
              <h3 className="mt-4 text-base font-medium text-white">{c.title}</h3>

              {/* 案例摘要 */}
              <p className="mt-2 text-sm leading-relaxed text-white/40 line-clamp-3">
                {c.summary}
              </p>

              {/* 成果标签 */}
              <div className="mt-4 flex flex-wrap gap-2">
                {c.results.slice(0, 2).map((r) => (
                  <span
                    key={r.metric}
                    className="rounded-full border border-white/[0.06] px-2.5 py-1 text-xs text-white/50"
                  >
                    {r.metric} {r.value}
                  </span>
                ))}
              </div>

              {/* 阅读全文 */}
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-white/60 transition-colors hover:text-white"
              >
                阅读全文
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── 详情弹窗 ─── */

function CaseModal({
  caseData,
  onClose,
}: {
  caseData: (typeof cases)[0] | null;
  onClose: () => void;
}) {
  if (!caseData) return null;

  return (
    <AnimatePresence>
      {caseData && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* 遮罩 */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

          {/* 弹窗内容 */}
          <motion.div
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/[0.06] bg-[#000] p-8"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-white/30 transition-colors hover:text-white/60"
            >
              <X className="h-5 w-5" />
            </button>

            {/* 用户信息 */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-2xl">
                {caseData.icon}
              </div>
              <div>
                <h2 className="text-xl font-medium text-white">{caseData.role}</h2>
                <p className="text-sm text-white/30">{caseData.roleEn}</p>
              </div>
            </div>

            {/* 案例标题 */}
            <h3 className="mt-6 text-lg font-medium text-white">{caseData.title}</h3>
            <p className="mt-1 text-xs text-white/30">{caseData.titleEn}</p>

            {/* 背景介绍 */}
            <div className="mt-6">
              <h4 className="text-sm font-medium text-white/60">背景介绍</h4>
              <p className="mt-2 text-sm leading-relaxed text-white/50">{caseData.summary}</p>
            </div>

            {/* 痛点 */}
            <div className="mt-6">
              <h4 className="text-sm font-medium text-white/60">使用 Foundry 前的痛点</h4>
              <ul className="mt-2 space-y-2">
                {caseData.painPoints.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-white/50">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            {/* 解决方案 */}
            <div className="mt-6">
              <h4 className="text-sm font-medium text-white/60">解决方案</h4>
              <p className="mt-2 text-sm leading-relaxed text-white/50">{caseData.solution}</p>
            </div>

            {/* 具体成果 */}
            <div className="mt-6">
              <h4 className="text-sm font-medium text-white/60">具体成果</h4>
              <div className="mt-3 grid grid-cols-3 gap-4">
                {caseData.results.map((r) => (
                  <div key={r.metric} className="rounded-lg border border-white/[0.06] p-3 text-center">
                    <p className="text-lg font-light text-white">{r.value}</p>
                    <p className="mt-0.5 text-xs text-white/30">{r.metric}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 用户金句 */}
            <div className="mt-8 rounded-lg border border-white/[0.06] p-6">
              <div className="text-4xl font-light leading-none text-white/10">&ldquo;</div>
              <p className="mt-2 text-base leading-relaxed text-white/60 italic">{caseData.quote}</p>
              <p className="mt-4 text-sm font-medium text-white/80">— {caseData.role}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── 底部 CTA 区 ─── */

function CTASection() {
  return (
    <section className="py-20 border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <motion.h2
          className="text-3xl font-light tracking-tight"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <span className="font-semibold">准备好开始了吗？</span>
        </motion.h2>
        <motion.p
          className="mt-2 text-sm text-white/45"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          Ready to Get Started?
        </motion.p>
        <motion.div
          className="mt-8 flex items-center justify-center gap-4"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            免费开始
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-6 py-3 text-sm font-medium text-white/70 transition-colors hover:border-white/40 hover:text-white"
          >
            查看定价
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
