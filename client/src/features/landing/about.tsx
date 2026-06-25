import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar, Footer, fadeUp, staggerContainer, staggerItem } from "./components";

const values = [
  {
    title: "AI 原生",
    desc: "不是在传统软件上叠加 AI，而是从第一行代码开始就为 AI 协作而设计。每个决策、每个流程都围绕人机协同构建。",
  },
  {
    title: "极致透明",
    desc: "每一次 Agent 调用、每一个决策分支、每一笔 Token 消耗都有完整记录。我们相信，可观测性是信任的基础。",
  },
  {
    title: "用户主权",
    desc: "你的数据属于你。我们不会出售你的数据，不会在未经同意的情况下使用你的内容训练模型。你随时可以导出或删除所有数据。",
  },
  {
    title: "持续进化",
    desc: "Foundry 本身也在不断进化。我们通过快速迭代、用户反馈和前沿技术追踪，让系统始终保持在 AI 应用的最前沿。",
  },
];

const timeline = [
  { year: "2025", event: "创立：三位创始人在一次关于 AI Agent 治理的深夜讨论中萌生了 Foundry 的想法" },
  { year: "2025 Q3", event: "技术验证：完成 Multi-Agent 编排引擎原型，验证了成本感知路由的可行性" },
  { year: "2026 Q1", event: "内测启动：邀请首批 50 位独立创业者参与封闭测试，收集核心反馈" },
  { year: "2026 Q2", event: "公开发布：Foundry 正式上线，向所有独立创业者开放注册" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#000] text-white flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-20">
        <div className="mx-auto max-w-6xl px-6">
          {/* Hero */}
          <motion.div
            className="max-w-3xl"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
          >
            <h1 className="text-3xl font-light tracking-tight sm:text-4xl lg:text-5xl">
              让每个人都能
              <br />
              <span className="font-semibold">运营一家公司</span>
            </h1>
            <p className="mt-6 text-base leading-relaxed text-white/50 sm:text-lg">
              Foundry 的使命是降低创业的门槛。我们相信，当 AI 能承担运营、执行、分析等重复性工作时，
              每个人都能专注于自己最擅长的事——创造价值。
            </p>
          </motion.div>

          {/* 分隔线 */}
          <div className="my-20 border-t border-white/[0.06]" />

          {/* 为什么做 Foundry */}
          <motion.div
            className="max-w-3xl"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <h2 className="text-xs font-mono text-white/25 tracking-widest uppercase">
              Why Foundry
            </h2>
            <h3 className="mt-4 text-2xl font-light tracking-tight">
              独立创业者的困境
            </h3>
            <p className="mt-4 text-sm leading-[1.8] text-white/45">
              独立创业者身兼数职——既是产品经理，又是开发者、设计师、市场运营、财务会计。
              传统的 SaaS 工具解决了单点问题，但没有解决"一个人如何同时做好所有事"的根本矛盾。
            </p>
            <p className="mt-4 text-sm leading-[1.8] text-white/45">
              AI Agent 的出现改变了这个等式。但直接使用 ChatGPT 或各种 AI 工具，
              缺乏组织管理、成本控制、审批流、可观测性等"公司级"能力。
              Foundry 就是为了解决这个问题而生的——
              <span className="text-white/70">
                把 AI Agent 组织成一家真正的公司，而你就是这家公司的 CEO。
              </span>
            </p>
          </motion.div>

          {/* 分隔线 */}
          <div className="my-20 border-t border-white/[0.06]" />

          {/* 价值观 */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <h2 className="text-xs font-mono text-white/25 tracking-widest uppercase">
              Our Values
            </h2>
            <h3 className="mt-4 text-2xl font-light tracking-tight">
              我们相信的事
            </h3>
          </motion.div>

          <motion.div
            className="mt-12 grid gap-[1px] bg-white/[0.06] md:grid-cols-2"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {values.map((v) => (
              <motion.div key={v.title} className="bg-[#000] p-8" variants={staggerItem}>
                <h4 className="text-base font-medium text-white">{v.title}</h4>
                <p className="mt-3 text-sm leading-relaxed text-white/40">
                  {v.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* 分隔线 */}
          <div className="my-20 border-t border-white/[0.06]" />

          {/* 发展历程 */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <h2 className="text-xs font-mono text-white/25 tracking-widest uppercase">
              Timeline
            </h2>
            <h3 className="mt-4 text-2xl font-light tracking-tight">
              发展历程
            </h3>
          </motion.div>

          <div className="mt-12 space-y-0">
            {timeline.map((item, i) => (
              <motion.div
                key={item.year}
                className="flex gap-6 border-t border-white/[0.06] py-6"
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                <div className="w-24 shrink-0 text-sm font-mono text-white/30">
                  {item.year}
                </div>
                <p className="text-sm leading-relaxed text-white/50">
                  {item.event}
                </p>
              </motion.div>
            ))}
          </div>

          {/* 分隔线 */}
          <div className="my-20 border-t border-white/[0.06]" />

          {/* 联系方式 */}
          <motion.div
            className="max-w-3xl"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <h2 className="text-xs font-mono text-white/25 tracking-widest uppercase">
              Contact
            </h2>
            <h3 className="mt-4 text-2xl font-light tracking-tight">
              联系我们
            </h3>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] p-6">
                <div className="text-sm text-white/30">商务合作</div>
                <div className="mt-2 text-sm text-white/70">business@foundry.ai</div>
              </div>
              <div className="rounded-xl border border-white/[0.06] p-6">
                <div className="text-sm text-white/30">技术支持</div>
                <div className="mt-2 text-sm text-white/70">support@foundry.ai</div>
              </div>
              <div className="rounded-xl border border-white/[0.06] p-6">
                <div className="text-sm text-white/30">隐私与安全</div>
                <div className="mt-2 text-sm text-white/70">privacy@foundry.ai</div>
              </div>
              <div className="rounded-xl border border-white/[0.06] p-6">
                <div className="text-sm text-white/30">媒体问询</div>
                <div className="mt-2 text-sm text-white/70">press@foundry.ai</div>
              </div>
            </div>
          </motion.div>

          {/* 底部链接 */}
          <div className="mt-16 border-t border-white/[0.06] pt-8">
            <div className="flex items-center gap-6 text-sm">
              <Link
                to="/privacy"
                className="text-white/40 transition-colors hover:text-white/70"
              >
                隐私政策
              </Link>
              <Link
                to="/terms"
                className="text-white/40 transition-colors hover:text-white/70"
              >
                服务条款
              </Link>
              <Link
                to="/"
                className="text-white/40 transition-colors hover:text-white/70"
              >
                返回首页
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
