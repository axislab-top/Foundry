import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

/* ─── 共享导航栏 ─── */

export function Navbar({ active }: { active?: "home" | "principles" | "pricing" }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/[0.06] bg-black/80 backdrop-blur-[20px]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded bg-white animate-pulse" />
          <span className="text-base font-medium text-white tracking-tight">Foundry</span>
        </Link>

        {/* 中间导航 */}
        <div className="hidden items-center gap-8 md:flex">
          <Link
            to="/"
            className={`text-sm transition-colors ${
              active === "home" ? "text-white" : "text-white/60 hover:text-white"
            }`}
          >
            首页
          </Link>
          <Link
            to="/principles"
            className={`text-sm transition-colors ${
              active === "principles" ? "text-white" : "text-white/60 hover:text-white"
            }`}
          >
            原理
          </Link>
          <Link
            to="/pricing"
            className={`text-sm transition-colors ${
              active === "pricing" ? "text-white" : "text-white/60 hover:text-white"
            }`}
          >
            定价
          </Link>
        </div>

        {/* 右侧按钮 */}
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm text-white/60 transition-colors hover:text-white">
            登录
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
          >
            开始使用
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ─── 共享页脚 ─── */

const footerLinks = [
  { label: "产品", href: "/principles" },
  { label: "文档", href: "/pricing" },
  { label: "定价", href: "/pricing" },
  { label: "关于", href: "/about" },
  { label: "隐私政策", href: "/privacy" },
  { label: "服务条款", href: "/terms" },
];

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-4 rounded bg-white/60" />
            <span className="text-sm text-white/60">Foundry</span>
          </div>

          {/* 链接 */}
          <div className="flex items-center gap-6">
            {footerLinks.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                className="text-sm text-white/30 transition-colors hover:text-white/60"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* 版权 */}
          <div className="text-xs text-white/20">&copy; 2026 Foundry. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}

/* ─── Canvas 粒子背景 ─── */

const agentNames = [
  "CEO Agent", "Market Analyst", "Finance Agent", "Dev Agent", "HR Agent",
  "Legal Agent", "Sales Agent", "Data Agent", "Support Agent", "Research Agent",
];

const techWords = ["ReAct", "Vector DB", "Memory", "Orchestrator"];

export function ParticleCanvas({ height }: { height?: number | string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const containerBox = containerRef.current!;
    const canvasNode = canvasRef.current!;

    const drawCtx = canvasNode.getContext("2d")!;

    let animationId: number;
    let width = 0;
    let canvasHeight = 0;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      text: string;
      opacity: number;
      size: number;
      hasAvatar: boolean;
      initial: string;
    }> = [];

    function resize() {
      width = containerBox.clientWidth;
      canvasHeight = containerBox.clientHeight;
      canvasNode.width = width;
      canvasNode.height = canvasHeight;
    }

    function createParticle(startFromBottom = true) {
      const isAgent = Math.random() > 0.3;
      const text = isAgent
        ? agentNames[Math.floor(Math.random() * agentNames.length)]
        : techWords[Math.floor(Math.random() * techWords.length)];

      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3);
      const speed = 0.3 + Math.random() * 0.6;

      return {
        x: Math.random() * width,
        y: startFromBottom ? canvasHeight + 20 : Math.random() * canvasHeight,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        text,
        opacity: 0.15 + Math.random() * 0.35,
        size: 11 + Math.random() * 5,
        hasAvatar: isAgent && Math.random() > 0.5,
        initial: text.charAt(0),
      };
    }

    // 初始化 40 个粒子
    for (let i = 0; i < 40; i++) {
      particles.push(createParticle(false));
    }

    function animate() {
      drawCtx.clearRect(0, 0, width, canvasHeight);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        drawCtx.globalAlpha = p.opacity;

        if (p.hasAvatar) {
          const avatarSize = p.size * 0.8;
          drawCtx.fillStyle = "rgba(255,255,255,0.15)";
          drawCtx.beginPath();
          drawCtx.arc(p.x, p.y - avatarSize * 0.3, avatarSize, 0, Math.PI * 2);
          drawCtx.fill();

          drawCtx.fillStyle = "#fff";
          drawCtx.font = `${avatarSize * 0.9}px sans-serif`;
          drawCtx.textAlign = "center";
          drawCtx.textBaseline = "middle";
          drawCtx.fillText(p.initial, p.x, p.y - avatarSize * 0.3);

          drawCtx.textAlign = "left";
          drawCtx.textBaseline = "alphabetic";
          drawCtx.font = `${p.size}px monospace`;
          drawCtx.fillText(p.text, p.x + avatarSize + 6, p.y);
        } else {
          drawCtx.fillStyle = "#fff";
          drawCtx.font = `${p.size}px monospace`;
          drawCtx.textAlign = "left";
          drawCtx.textBaseline = "alphabetic";
          drawCtx.fillText(p.text, p.x, p.y);
        }

        if (p.y < -30 || p.x < -100 || p.x > width + 100) {
          particles[i] = createParticle(true);
        }
      }

      animationId = requestAnimationFrame(animate);
    }

    resize();
    animate();

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={height ? { height } : undefined}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

/* ─── 关键词滚动条（双层） ─── */

const keywords = [
  { text: "Multi-Agent Orchestration", bright: true },
  { text: "Human-in-the-Loop", bright: false },
  { text: "Cost-aware Routing", bright: true },
  { text: "Temporal Long-running Tasks", bright: false },
  { text: "Full Observability", bright: true },
  { text: "Memory Layer", bright: false },
  { text: "Hierarchical Task Graph", bright: true },
  { text: "Early-Exit Decision Log", bright: false },
  { text: "Company-grade Governance", bright: true },
  { text: "Feature Flag · 金丝雀 · Rollback", bright: false },
];

const keywordsZh = [
  "招募 Agent", "绩效考核", "预算门控", "审批流", "成本路由",
  "长周期任务", "记忆沉淀", "全链路可观测", "灰度发布", "一键回滚",
];

export function KeywordMarquee() {
  const allKeywords = [...keywords, ...keywords];
  const allKeywordsZh = [...keywordsZh, ...keywordsZh];

  return (
    <section className="border-y border-white/[0.06] py-3 overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap">
        {allKeywords.map((kw, i) => (
          <span
            key={i}
            className={`mx-6 text-sm tracking-wide ${
              kw.bright ? "text-white/40" : "text-white/15"
            }`}
          >
            {kw.text}
          </span>
        ))}
      </div>

      <div className="flex animate-marquee-reverse whitespace-nowrap mt-2">
        {allKeywordsZh.map((kw, i) => (
          <span key={i} className="mx-5 text-xs tracking-wide text-white/20">
            {kw}
          </span>
        ))}
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-reverse {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .animate-marquee-reverse {
          animation: marquee-reverse 40s linear infinite;
        }
      `}</style>
    </section>
  );
}

/* ─── 动画配置 ─── */

export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};
