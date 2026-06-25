import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Zap, Shield, TrendingDown } from "lucide-react";
import { Navbar, Footer, fadeUp, staggerContainer, staggerItem } from "./components";

/* ─── Agent 薪资数据 ─── */

const agents = [
  {
    name: "CEO Agent",
    role: "首席执行官",
    model: "Claude Opus",
    inputPrice: 0.15,
    outputPrice: 0.75,
    desc: "战略决策、复杂分析、多步推理",
    tier: "premium" as const,
  },
  {
    name: "CTO Agent",
    role: "技术总监",
    model: "Claude Sonnet",
    inputPrice: 0.003,
    outputPrice: 0.015,
    desc: "技术架构、代码审查、系统设计",
    tier: "standard" as const,
  },
  {
    name: "Dev Agent",
    role: "开发工程师",
    model: "Claude Sonnet",
    inputPrice: 0.003,
    outputPrice: 0.015,
    desc: "代码开发、Bug 修复、功能实现",
    tier: "standard" as const,
  },
  {
    name: "Research Agent",
    role: "调研分析师",
    model: "GPT-4o",
    inputPrice: 0.005,
    outputPrice: 0.015,
    desc: "市场调研、竞品分析、数据收集",
    tier: "standard" as const,
  },
  {
    name: "Finance Agent",
    role: "财务主管",
    model: "Claude Sonnet",
    inputPrice: 0.003,
    outputPrice: 0.015,
    desc: "预算编制、成本核算、财务报表",
    tier: "standard" as const,
  },
  {
    name: "Intern Agent",
    role: "实习助理",
    model: "GPT-4o-mini",
    inputPrice: 0.00015,
    outputPrice: 0.0006,
    desc: "日常助理、文档整理、简单任务",
    tier: "economy" as const,
  },
];

const tierColors = {
  premium: { bg: "bg-amber-500/10", text: "text-amber-400/80", border: "border-amber-500/20", label: "高端" },
  standard: { bg: "bg-blue-500/10", text: "text-blue-400/80", border: "border-blue-500/20", label: "标准" },
  economy: { bg: "bg-emerald-500/10", text: "text-emerald-400/80", border: "border-emerald-500/20", label: "经济" },
};

/* ─── 充值档位 ─── */

const rechargeTiers = [
  { amount: 50, bonus: 0, label: "入门" },
  { amount: 100, bonus: 5, label: "基础" },
  { amount: 500, bonus: 50, label: "推荐", popular: true },
  { amount: 1000, bonus: 150, label: "企业" },
];

/* ─── 消耗模拟参数 ─── */

const dailyTaskOptions = [
  { label: "轻度使用", tasks: 20, desc: "每天约 20 次任务调用" },
  { label: "正常使用", tasks: 80, desc: "每天约 80 次任务调用" },
  { label: "重度使用", tasks: 200, desc: "每天约 200 次任务调用" },
];

/* ─── FAQ ─── */

const faqs = [
  {
    q: "Token 是什么？",
    a: "Token 是 AI 模型处理文字的基本单位。简单理解：1 个汉字约 1-2 个 Token，1 个英文单词约 1 个 Token。每次 Agent 执行任务，都会消耗输入（你的指令）和输出（Agent 的回复）两部分 Token。",
  },
  {
    q: "不同 Agent 的价格为什么不同？",
    a: "每个 Agent 背后对应不同的 AI 模型。能力越强的模型（如 Claude Opus）价格越高，适合战略决策等复杂任务；轻量模型（如 GPT-4o-mini）价格极低，适合日常助理工作。系统会根据任务复杂度智能分配 Agent，帮你节省成本。",
  },
  {
    q: "充值后可以退款吗？",
    a: "未消耗的充值金额支持 7 天内无理由退款。已消耗的 Token 费用不可退还。如遇特殊情况，请联系客服处理。",
  },
  {
    q: "Token 用完了会怎样？",
    a: "余额不足时，Agent 会暂停执行新任务，但不会丢失任何数据和进度。充值后即可恢复运行。你也可以设置预算预警，在余额低于阈值时收到通知。",
  },
  {
    q: "如何控制成本？",
    a: "Foundry 内置预算门控功能：你可以为每个部门或 Agent 设置月度预算上限，系统会在接近上限时自动预警，超支时自动熔断。此外，成本感知路由会优先使用性价比更高的模型完成任务。",
  },
  {
    q: "招募 Agent 需要额外付费吗？",
    a: "不需要。在招募市场中选择你需要的 Agent，直接招募到部门即可开始工作。你只需为 Agent 实际消耗的 Token 付费，没有额外的订阅费或使用费。",
  },
];

/* ─── 主页面 ─── */

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#000] text-white">
      <Navbar active="pricing" />
      <HeroSection />
      <AgentSalarySection />
      <CostOptimizationSection />
      <RechargeSection />
      <SimulatorSection />
      <FAQSection />
      <Footer />
    </div>
  );
}

/* ─── Hero 区 ─── */

function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20">
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
        <motion.div
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-1.5"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          <span className="text-xs text-white/60">Pay-as-you-go</span>
        </motion.div>

        <motion.h1
          className="mt-6 text-4xl font-light tracking-tight sm:text-5xl lg:text-6xl"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          Token 即薪资，
          <span className="font-semibold">按量计费</span>
        </motion.h1>

        <motion.p
          className="mt-6 max-w-xl mx-auto text-sm leading-relaxed text-white/60 sm:text-base"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          每个 Agent 背后对应不同的 AI 模型，能力越强消耗越高。
          <br />
          你只需充值公司账户，系统自动为每次执行扣费。
        </motion.p>

        <motion.div
          className="mt-8 flex items-center justify-center gap-6 text-xs text-white/50"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          <span>注册即送 ¥10 体验金</span>
          <span className="h-3 w-px bg-white/10" />
          <span>无订阅费 · 无隐藏费用</span>
          <span className="h-3 w-px bg-white/10" />
          <span>用多少充多少</span>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Agent 薪资表 ─── */

function AgentSalarySection() {
  return (
    <section className="py-20 border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-12"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
            不同员工，<span className="font-semibold">不同薪资</span>
          </h2>
          <p className="mt-3 text-sm text-white/55">
            每个 Agent 对应不同的 AI 模型，价格按 Token 消耗计算
          </p>
        </motion.div>

        {/* 图例 */}
        <motion.div
          className="flex items-center justify-center gap-6 mb-8"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {Object.entries(tierColors).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${val.bg} border ${val.border}`} />
              <span className="text-xs text-white/55">{val.label}</span>
            </div>
          ))}
        </motion.div>

        {/* 薪资表 */}
        <motion.div
          className="overflow-x-auto"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="min-w-[640px]">
            {/* 表头 */}
            <div className="grid grid-cols-[1fr_120px_100px_100px_1fr] gap-4 px-6 py-3 border-b border-white/[0.06]">
              <span className="text-xs text-white/45 uppercase tracking-wider">员工</span>
              <span className="text-xs text-white/45 uppercase tracking-wider">模型</span>
              <span className="text-xs text-white/45 uppercase tracking-wider text-right">输入价格</span>
              <span className="text-xs text-white/45 uppercase tracking-wider text-right">输出价格</span>
              <span className="text-xs text-white/45 uppercase tracking-wider">适合场景</span>
            </div>

            {/* 数据行 */}
            {agents.map((agent) => {
              const tier = tierColors[agent.tier];
              return (
                <motion.div
                  key={agent.name}
                  className="grid grid-cols-[1fr_120px_100px_100px_1fr] gap-4 items-center px-6 py-4 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  variants={staggerItem}
                >
                  {/* 员工信息 */}
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-lg ${tier.bg} border ${tier.border} flex items-center justify-center`}>
                      <span className={`text-xs font-medium ${tier.text}`}>
                        {agent.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{agent.name}</div>
                      <div className="text-xs text-white/50">{agent.role}</div>
                    </div>
                  </div>

                  {/* 模型 */}
                  <span className="text-sm text-white/65">{agent.model}</span>

                  {/* 输入价格 */}
                  <span className="text-sm text-white/60 text-right font-mono">
                    ¥{agent.inputPrice}
                    <span className="text-xs text-white/45">/1K</span>
                  </span>

                  {/* 输出价格 */}
                  <span className="text-sm text-white/60 text-right font-mono">
                    ¥{agent.outputPrice}
                    <span className="text-xs text-white/45">/1K</span>
                  </span>

                  {/* 适合场景 */}
                  <span className="text-xs text-white/50">{agent.desc}</span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <motion.p
          className="mt-6 text-center text-xs text-white/35"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          价格为参考值，实际价格以系统显示为准 · 1K = 1,000 Tokens
        </motion.p>
      </div>
    </section>
  );
}

/* ─── 智能成本路由 ─── */

function CostOptimizationSection() {
  const features = [
    {
      icon: TrendingDown,
      title: "成本感知路由",
      desc: "简单任务自动分配给便宜模型，关键决策才调用高端模型。系统帮你做成本优化，无需手动干预。",
    },
    {
      icon: Shield,
      title: "预算门控",
      desc: "为每个部门或 Agent 设置月度预算上限。接近上限时自动预警，超支时自动熔断，成本永远可控。",
    },
    {
      icon: Zap,
      title: "实时消耗看板",
      desc: "每一次调用的 Token 消耗都有完整记录。按 Agent、部门、任务类型多维度分析，让每一分钱都花得明白。",
    },
  ];

  return (
    <section className="py-20 border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-12"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
            你的 <span className="font-semibold">CFO Agent</span> 会帮你省钱
          </h2>
          <p className="mt-3 text-sm text-white/55">
            Foundry 内置智能成本管理系统，自动优化每一次调用
          </p>
        </motion.div>

        <motion.div
          className="grid gap-4 md:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              className="rounded-xl border border-white/[0.06] p-6"
              variants={staggerItem}
            >
              <f.icon className="h-5 w-5 text-white/50" />
              <h3 className="mt-4 text-base font-medium text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── 充值档位 ─── */

function RechargeSection() {
  const [customAmount, setCustomAmount] = useState("");

  return (
    <section className="py-20 border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-12"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
            为你的公司<span className="font-semibold">注入资金</span>
          </h2>
          <p className="mt-3 text-sm text-white/55">
            选择充值档位，大额充值享额外赠送
          </p>
        </motion.div>

        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {rechargeTiers.map((tier) => (
            <motion.div
              key={tier.amount}
              className={`relative rounded-xl border p-6 text-center ${
                tier.popular
                  ? "border-white/20 bg-white/[0.03]"
                  : "border-white/[0.06]"
              }`}
              variants={staggerItem}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-black">
                    推荐
                  </span>
                </div>
              )}

              <div className="text-xs text-white/50 mb-3">{tier.label}</div>
              <div className="text-3xl font-light text-white">¥{tier.amount}</div>

              {tier.bonus > 0 && (
                <div className="mt-2 inline-block rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-400">
                  赠送 ¥{tier.bonus}
                </div>
              )}

              <div className="mt-4 text-xs text-white/40">
                实际到账 ¥{tier.amount + tier.bonus}
              </div>

              <Link
                to="/register"
                className={`mt-6 block w-full rounded-lg py-2.5 text-center text-sm font-medium transition-colors ${
                  tier.popular
                    ? "bg-white text-black hover:bg-white/90"
                    : "border border-white/20 text-white/70 hover:border-white/40 hover:text-white"
                }`}
              >
                立即充值
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* 自定义金额 */}
        <motion.div
          className="mt-8 mx-auto max-w-sm text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <span className="text-sm text-white/50">¥</span>
            <input
              type="number"
              placeholder="自定义金额"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
            <Link
              to="/register"
              className="rounded-lg bg-white/10 px-4 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20"
            >
              充值
            </Link>
          </div>
          <p className="mt-2 text-xs text-white/35">单次充值 ≥ ¥1000 享 15% 赠送</p>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── 消耗模拟器 ─── */

function SimulatorSection() {
  const [selectedLevel, setSelectedLevel] = useState(1);

  const monthlyCost = useMemo(() => {
    const opt = dailyTaskOptions[selectedLevel];
    // 假设每次任务平均消耗 3K input + 1K output，混合价格约 ¥0.01/次
    const avgCostPerTask = 0.01;
    return Math.round(opt.tasks * 30 * avgCostPerTask);
  }, [selectedLevel]);

  return (
    <section className="py-20 border-t border-white/[0.06]">
      <div className="mx-auto max-w-3xl px-6">
        <motion.div
          className="text-center mb-10"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
            每月花多少钱？
          </h2>
          <p className="mt-3 text-sm text-white/55">
            根据使用强度估算你的月度 Token 消耗
          </p>
        </motion.div>

        <motion.div
          className="rounded-xl border border-white/[0.06] p-6 sm:p-8"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {/* 使用强度选择 */}
          <div className="grid grid-cols-3 gap-3">
            {dailyTaskOptions.map((opt, i) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setSelectedLevel(i)}
                className={`rounded-lg border px-4 py-3 text-center transition-all ${
                  selectedLevel === i
                    ? "border-white/30 bg-white/[0.06]"
                    : "border-white/[0.06] hover:border-white/10"
                }`}
              >
                <div className={`text-sm font-medium ${selectedLevel === i ? "text-white" : "text-white/65"}`}>
                  {opt.label}
                </div>
                <div className="mt-1 text-xs text-white/45">{opt.desc}</div>
              </button>
            ))}
          </div>

          {/* 估算结果 */}
          <div className="mt-8 text-center">
            <div className="text-xs text-white/50 mb-2">预估月度消耗</div>
            <div className="text-5xl font-light text-white tracking-tight">
              ¥<span className="font-medium">{monthlyCost}</span>
            </div>
            <div className="mt-2 text-xs text-white/45">
              约 {dailyTaskOptions[selectedLevel].tasks * 30} 次任务调用 / 月
            </div>
          </div>

          {/* 说明 */}
          <div className="mt-6 rounded-lg bg-white/[0.02] px-4 py-3 text-xs text-white/45 leading-relaxed">
            * 以上为基于混合模型的平均估算。实际费用取决于你的 Agent 配置和任务复杂度。
            使用成本感知路由，系统会自动优化每次调用的模型选择。
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── FAQ 区域 ─── */

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 border-t border-white/[0.06]">
      <div className="mx-auto max-w-3xl px-6">
        <motion.div
          className="text-center mb-10"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-2xl font-light tracking-tight sm:text-3xl">
            <span className="font-semibold">常见问题</span>
          </h2>
          <p className="mt-2 text-sm text-white/55">Frequently Asked Questions</p>
        </motion.div>

        <motion.div
          className="space-y-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              className="border border-white/[0.06] rounded-lg"
              variants={staggerItem}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-medium text-white">{faq.q}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-white/45 transition-transform duration-200 ${
                    openIndex === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              <AnimatePresence initial={false}>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-white/[0.06] px-5 py-4">
                      <p className="text-sm leading-relaxed text-white/60">{faq.a}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
