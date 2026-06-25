import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  Navbar,
  Footer,
  ParticleCanvas,
  fadeUp,
  staggerContainer,
  staggerItem,
} from "./components";

/* ─── 数据 ─── */

const orchestrationSteps = [
  {
    num: "01",
    title: "意图解析",
    tag: "NLP Parser",
    desc: "自然语言输入经 NLU 管道解析为结构化意图图谱，置信度 <0.8 自动触发澄清循环。",
  },
  {
    num: "02",
    title: "任务拆解",
    tag: "Task Decomposer",
    desc: "DAG 拆解引擎将复合目标分解为原子子任务，自动生成依赖拓扑与优先级队列。",
  },
  {
    num: "03",
    title: "并行调度",
    tag: "Parallel 16 max",
    desc: "最大 16 路并行执行，动态负载均衡，单节点故障自动迁移。",
    highlight: true,
  },
  {
    num: "04",
    title: "人工介入",
    tag: "Resume <2s",
    desc: "关键决策节点推送审批卡片，人工确认后 <2s 恢复执行，上下文零丢失。",
    highlight: true,
  },
  {
    num: "05",
    title: "记忆沉淀",
    tag: "Hit 84.2%",
    desc: "执行轨迹自动沉淀为可检索记忆，相似任务命中率 84.2%，避免重复计算。",
    highlight: true,
  },
];

const specCards = [
  {
    title: "Runtime Specs",
    specs: [
      { key: "并发上限", value: "16 parallel" },
      { key: "单任务超时", value: "720 hrs max" },
      { key: "检查点间隔", value: "30s adaptive" },
    ],
  },
  {
    title: "Memory Layer",
    specs: [
      { key: "向量维度", value: "1536-dim" },
      { key: "检索延迟", value: "<50ms p99" },
      { key: "命中率", value: "84.2%" },
    ],
  },
  {
    title: "Governance",
    specs: [
      { key: "审批恢复", value: "<2s resume" },
      { key: "回滚耗时", value: "<2s rollback" },
      { key: "审计保留", value: "365d retention" },
    ],
  },
];

const tokenTasks = [
  { name: "市场分析", traditional: 48200, foundry: 21400 },
  { name: "竞品调研", traditional: 36800, foundry: 18200 },
  { name: "报告生成", traditional: 29500, foundry: 14800 },
];

const observabilityItems = [
  {
    label: "Decision Log",
    title: "决策日志",
    desc: "每一次 Agent 决策分支完整记录，支持回放和审计",
    value: "100%",
    numericValue: 100,
    suffix: "%",
    valueLabel: "traced",
  },
  {
    label: "Performance",
    title: "缓存性能",
    desc: "记忆层命中率，避免重复计算和调用",
    value: "84.2%",
    numericValue: 84.2,
    suffix: "%",
    valueLabel: "命中",
  },
  {
    label: "Cost Trace",
    title: "成本追踪",
    desc: "单次执行粒度级 Token 消耗追踪",
    value: "¥0.001",
    numericValue: 0.001,
    prefix: "¥",
    suffix: "",
    valueLabel: "/exec",
  },
  {
    label: "Governance",
    title: "治理回滚",
    desc: "异常检测到回滚完成的端到端耗时",
    value: "<2s",
    numericValue: 2,
    prefix: "<",
    suffix: "s",
    valueLabel: "rollback",
  },
  {
    label: "Audit",
    title: "审计保留",
    desc: "全量操作日志默认保留时长",
    value: "365d",
    numericValue: 365,
    suffix: "d",
    valueLabel: "retention",
  },
  {
    label: "Temporal",
    title: "长周期任务",
    desc: "支持的单任务最大连续运行时长",
    value: "720hrs",
    numericValue: 720,
    suffix: "hrs",
    valueLabel: "Max",
  },
];

/* ─── 主页面 ─── */

export default function PrinciplesPage() {
  return (
    <div className="min-h-screen bg-[#000] text-white">
      <Navbar active="principles" />
      <HeroWithParticles />
      <OrchestrationSection />
      <TokenEfficiencySection />
      <ObservabilitySection />
      <Footer />
    </div>
  );
}

/* ─── Hero 区域（带粒子背景） ─── */

function HeroWithParticles() {
  return (
    <section className="relative h-[280px] flex items-center justify-center overflow-hidden pt-16">
      <ParticleCanvas height={280} />

      <motion.div
        className="relative z-10 text-center px-6"
        variants={fadeUp}
        initial="hidden"
        animate="visible"
      >
        <h1 className="text-4xl font-light tracking-tight sm:text-5xl">技术原理</h1>
        <p className="mt-4 text-sm text-white/45">How Foundry Works Under the Hood</p>
      </motion.div>
    </section>
  );
}

/* ─── 数字滚动动画组件 ─── */

function CountUpValue({
  item,
}: {
  item: (typeof observabilityItems)[0];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const [displayValue, setDisplayValue] = useState("0");

  useEffect(() => {
    if (!isInView) return;

    const duration = 1500;
    const startTime = Date.now();
    const value = item.numericValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      const current = value * eased;
      const prefix = item.prefix || "";

      if (value >= 100) {
        setDisplayValue(`${prefix}${Math.floor(current)}${item.suffix}`);
      } else if (value >= 1) {
        setDisplayValue(`${prefix}${current.toFixed(1)}${item.suffix}`);
      } else {
        setDisplayValue(`${prefix}${current.toFixed(3)}${item.suffix}`);
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(item.value);
      }
    };

    requestAnimationFrame(animate);
  }, [isInView, item]);

  return (
    <div ref={ref} className="text-3xl font-light tracking-tight text-white">
      {displayValue}
    </div>
  );
}

/* ─── 进度条动画组件 ─── */

function AnimatedBar({ percentage, delay }: { percentage: number; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <div ref={ref} className="h-1.5 w-full rounded-full bg-white/[0.06]">
      <motion.div
        className="h-full rounded-full bg-white/50"
        initial={{ width: 0 }}
        animate={isInView ? { width: `${percentage}%` } : { width: 0 }}
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
      />
    </div>
  );
}

/* ─── 区块一：编排架构 ─── */

function OrchestrationSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-16"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-3xl font-light tracking-tight sm:text-4xl">
            Hierarchical + Parallel
            <br />
            <span className="font-semibold">动态任务编排</span>
          </h2>
        </motion.div>

        <motion.div
          className="grid gap-[1px] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-5"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {orchestrationSteps.map((step) => (
            <motion.div
              key={step.num}
              className={`bg-[#000] p-6 ${step.highlight ? "border-l border-l-white/10" : ""}`}
              variants={staggerItem}
            >
              <div className="text-xs text-white/20 font-mono">{step.num}</div>
              <h3 className="mt-3 text-base font-medium text-white">{step.title}</h3>
              <div
                className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs ${
                  step.highlight
                    ? "border border-white/20 text-white/50"
                    : "border border-white/[0.06] text-white/30"
                }`}
              >
                {step.tag}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/35">{step.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {specCards.map((card) => (
            <motion.div
              key={card.title}
              className="border border-white/[0.06] rounded-lg p-6"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <h4 className="text-sm font-medium text-white/60">{card.title}</h4>
              <div className="mt-4 space-y-3">
                {card.specs.map((spec) => (
                  <div key={spec.key} className="flex items-center justify-between">
                    <span className="text-xs text-white/30">{spec.key}</span>
                    <span className="text-sm font-mono text-white/70">{spec.value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 区块二：Token 效率 ─── */

function TokenEfficiencySection() {
  const maxVal = Math.max(...tokenTasks.flatMap((t) => [t.traditional, t.foundry]));

  return (
    <section className="py-20 border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-16"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-3xl font-light tracking-tight sm:text-4xl">
            重任务下消耗更少，
            <br />
            <span className="font-semibold">完成更快</span>
          </h2>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2">
          <motion.div
            className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-8"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <h3 className="text-sm font-medium text-white/40">传统逐步调用</h3>
            <div className="mt-6 space-y-6">
              {tokenTasks.map((task, i) => (
                <div key={task.name}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/30">{task.name}</span>
                    <span className="text-xs font-mono text-white/40">
                      {task.traditional.toLocaleString()} tokens
                    </span>
                  </div>
                  <AnimatedBar percentage={(task.traditional / maxVal) * 100} delay={i * 0.15} />
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="rounded-lg border border-white/20 p-8"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            <h3 className="text-sm font-medium text-white/60">Foundry 成本感知路由</h3>
            <div className="mt-6 space-y-6">
              {tokenTasks.map((task, i) => (
                <div key={task.name}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/50">{task.name}</span>
                    <span className="text-xs font-mono text-white/70">
                      {task.foundry.toLocaleString()} tokens
                    </span>
                  </div>
                  <AnimatedBar
                    percentage={(task.foundry / maxVal) * 100}
                    delay={0.15 + i * 0.15}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <span className="text-sm text-white/50">
            相同复合任务节省 <span className="text-white font-medium">52%</span> Token 消耗，{" "}
            <span className="text-white font-medium">−52%</span>
          </span>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── 区块三：可观测架构 ─── */

function ObservabilitySection() {
  return (
    <section className="py-20 border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          className="text-center mb-16"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <h2 className="text-3xl font-light tracking-tight sm:text-4xl">
            没有黑箱，
            <br />
            <span className="font-semibold">每一步都可追溯</span>
          </h2>
        </motion.div>

        <motion.div
          className="grid gap-[1px] bg-white/[0.06] md:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {observabilityItems.map((item) => (
            <motion.div key={item.label} className="bg-[#000] p-8" variants={staggerItem}>
              <div className="text-xs text-white/20 font-mono">{item.label}</div>
              <h3 className="mt-3 text-lg font-medium text-white">{item.title}</h3>
              <p className="mt-3 text-xs leading-relaxed text-white/35">{item.desc}</p>
              <div className="mt-6 flex items-baseline gap-2">
                <CountUpValue item={item} />
                <span className="text-sm text-white/30">{item.valueLabel}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
