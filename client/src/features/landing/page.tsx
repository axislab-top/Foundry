import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  Navbar,
  Footer,
  ParticleCanvas,
  KeywordMarquee,
  fadeUp,
  staggerContainer,
  staggerItem,
} from "./components";

/* ─── 数据 ─── */

const metrics = [
  { value: 2400000, suffix: "+", label: "执行次数", sub: "Agent Executions", display: "2.4M+" },
  { value: 99.2, suffix: "%", label: "可用率", sub: "Uptime SLA", display: "99.2%" },
  { value: 4.2, suffix: "s", label: "平均耗时", sub: "Avg. Latency", display: "4.2s" },
  { value: 52, suffix: "%", label: "Token 节省", sub: "Cost Reduction", display: "52%" },
];

const philosophyItems = [
  {
    num: "01",
    title: "Agent 有职级有考核",
    desc: "每个 Agent 都有明确的职责边界、汇报关系和绩效指标。不是随意调用的工具，而是有组织架构的数字员工。",
    tag: "Org Structure",
  },
  {
    num: "02",
    title: "预算门控 · 成本感知路由",
    desc: "系统自动追踪每次调用的 Token 消耗，根据预算约束智能选择模型。超支自动熔断，成本永远可控。",
    tag: "Cost Control",
  },
  {
    num: "03",
    title: "审批流 · 你只做决策",
    desc: "Agent 自动执行日常事务，只在关键决策节点推送审批。你的时间只花在真正重要的事情上。",
    tag: "Approval Flow",
  },
  {
    num: "04",
    title: "长周期任务持续运行",
    desc: "支持跨小时、跨天的复杂任务。系统自动保存检查点，故障恢复后从断点继续，不浪费任何计算。",
    tag: "Long-running Tasks",
  },
  {
    num: "05",
    title: "极致可观测",
    desc: "每一次 Agent 调用、每一个决策分支、每一笔 Token 消耗都有完整 Trace。问题排查从小时级降到秒级。",
    tag: "Full Observability",
  },
  {
    num: "06",
    title: "公司级治理架构",
    desc: "基于 RBAC 的权限体系、审计日志、合规检查。满足企业级安全要求，让 AI 治理有章可循。",
    tag: "Governance",
  },
];

/* ─── 主页面 ─── */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#000] text-white">
      <Navbar active="home" />
      <HeroSection />
      <KeywordMarquee />
      <MetricsSection />
      <PhilosophySection />
      <Footer />
    </div>
  );
}

/* ─── Hero 区 ─── */

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* 网格线背景 */}
      <div
        className="absolute inset-0 -z-20"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Canvas 粒子背景 */}
      <ParticleCanvas />

      {/* 内容 */}
      <motion.div
        className="relative z-10 mx-auto max-w-3xl px-6 text-center"
        variants={fadeUp}
        initial="hidden"
        animate="visible"
      >
        {/* 小标签 */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          <span className="text-xs text-white/50">One Person Company OS</span>
        </div>

        {/* 大标题 */}
        <h1 className="mt-8 text-5xl font-light leading-tight tracking-[-2.5px] sm:text-6xl lg:text-7xl">
          <span className="font-light">像管理</span>
          <span className="font-semibold">真实公司</span>
          <br />
          <span className="font-light">一样管理你的</span>
          <span className="font-semibold"> AI 组织</span>
        </h1>

        {/* 副标题 */}
        <p className="mt-6 text-base leading-relaxed text-white/45 sm:text-lg">
          Foundry 是 AI 驱动的一人公司操作系统。你只需提出目标，AI Agent 团队会自动分工、执行、汇报
          ——让你像运营一家完整公司一样高效工作。
        </p>

        {/* 按钮 */}
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            to="/register"
            className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            免费开始
          </Link>
          <a
            href="#philosophy"
            className="rounded-lg border border-white/20 px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white"
          >
            查看原理
          </a>
        </div>

        {/* 底部小字 */}
        <p className="mt-8 text-xs text-white/30">无需信用卡 · 5 分钟完成配置</p>
      </motion.div>
    </section>
  );
}

/* ─── 数字滚动动画组件 ─── */

function CountUpNumber({ value, suffix, display }: { value: number; suffix: string; display: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const [displayValue, setDisplayValue] = useState("0");

  useEffect(() => {
    if (!isInView) return;

    const duration = 1500;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      if (value >= 1000000) {
        const current = value * eased;
        setDisplayValue(`${(current / 1000000).toFixed(1)}M${suffix}`);
      } else if (value >= 1000) {
        const current = value * eased;
        setDisplayValue(`${Math.floor(current).toLocaleString()}${suffix}`);
      } else if (Number.isInteger(value)) {
        setDisplayValue(`${Math.floor(value * eased)}${suffix}`);
      } else {
        setDisplayValue(`${(value * eased).toFixed(1)}${suffix}`);
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(display);
      }
    };

    requestAnimationFrame(animate);
  }, [isInView, value, suffix, display]);

  return (
    <div ref={ref} className="text-4xl font-light tracking-tight">
      {displayValue}
    </div>
  );
}

/* ─── 数据指标区 ─── */

function MetricsSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-2 md:grid-cols-4">
          {metrics.map((m, i) => (
            <motion.div
              key={m.label}
              className={`border-white/[0.06] px-8 py-6 text-center ${
                i < metrics.length - 1 ? "border-r" : ""
              } ${i >= 2 ? "max-md:border-t max-md:mt-[-1px]" : ""}`}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <CountUpNumber value={m.value} suffix={m.suffix} display={m.display} />
              <div className="mt-2 text-sm text-white/60">{m.label}</div>
              <div className="mt-1 text-xs text-white/25">{m.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 产品哲学区（staggerChildren） ─── */

function PhilosophySection() {
  return (
    <section id="philosophy" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-16"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-3xl font-light tracking-tight sm:text-4xl">
            你不是在「玩 Prompt」，
            <br />
            <span className="font-semibold">你在运营一家公司</span>
          </h2>
        </motion.div>

        <motion.div
          className="grid gap-[1px] bg-white/[0.06] md:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {philosophyItems.map((item) => (
            <motion.div
              key={item.num}
              className="bg-[#000] p-8"
              variants={staggerItem}
            >
              <div className="text-xs text-white/20 font-mono">{item.num}</div>
              <h3 className="mt-3 text-lg font-medium text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/40">{item.desc}</p>
              <div className="mt-4 inline-block rounded-full border border-white/[0.06] px-3 py-1 text-xs text-white/30">
                {item.tag}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── [MOCK] 原有代码备份（恢复时取消注释） ─── */

/*
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Bot, GitBranch, BarChart3, ArrowRight, ChevronRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-800">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <WorkflowSection />
      <Footer />
    </div>
  );
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${scrolled ? "border-b border-gray-200 bg-white/80 backdrop-blur-md shadow-sm" : "bg-transparent"}}>
      ...
    </nav>
  );
}
*/
