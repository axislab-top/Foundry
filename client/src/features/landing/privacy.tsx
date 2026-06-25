import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar, Footer, fadeUp } from "./components";

const sections = [
  {
    title: "1. 信息收集",
    content:
      "当您注册 Foundry 账户时，我们会收集您的邮箱地址、用户名等基本信息。在使用服务过程中，我们还会收集您与 AI Agent 的交互记录、任务执行数据、以及使用日志等操作信息。此外，我们通过 Cookie 和类似技术收集设备信息、浏览器类型、IP 地址等技术数据。",
  },
  {
    title: "2. 信息使用",
    content:
      "我们使用收集的信息来：提供、维护和改进 Foundry 服务；处理您的请求和交易；发送服务相关通知和更新；防范欺诈和滥用行为；以及遵守法律法规要求。我们不会将您的个人信息用于未经授权的商业目的。",
  },
  {
    title: "3. 信息共享",
    content:
      "我们不会出售您的个人信息。仅在以下情况下共享您的信息：经您明确同意后；为提供您所请求的服务而与第三方服务商共享（如云基础设施提供商）；为遵守法律法规、政府请求或法律程序；以及在合并、收购或资产出售的情况下，作为转让资产的一部分。",
  },
  {
    title: "4. 数据安全",
    content:
      "我们采用行业标准的安全措施保护您的个人信息，包括传输加密（TLS）、静态数据加密、访问控制和定期安全审计。尽管如此，没有任何电子传输或存储方式是 100% 安全的，我们无法保证绝对的安全性。",
  },
  {
    title: "5. 数据存储与保留",
    content:
      "您的数据存储在安全的云服务器上。我们会在提供服务所需的期限内保留您的个人信息。当您删除账户后，我们将在合理时间内删除或匿名化您的个人数据，但法律法规要求保留的除外。",
  },
  {
    title: "6. Cookie 使用",
    content:
      "我们使用 Cookie 和类似技术来维持您的登录状态、记住您的偏好设置、分析服务使用情况。您可以通过浏览器设置管理 Cookie，但这可能影响部分功能的正常使用。",
  },
  {
    title: "7. 您的权利",
    content:
      "您有权：访问、更正或删除您的个人信息；撤回同意并要求停止处理您的数据；获取您数据的副本（数据可携性）；以及对我们数据处理行为提出投诉。如需行使上述权利，请通过 privacy@foundry.ai 联系我们。",
  },
  {
    title: "8. 儿童隐私",
    content:
      "Foundry 服务不面向 16 岁以下儿童。我们不会故意收集 16 岁以下儿童的个人信息。如果我们发现已收集了儿童的个人信息，将立即采取措施删除相关数据。",
  },
  {
    title: "9. 政策更新",
    content:
      "我们可能会不时更新本隐私政策。重大变更时，我们会通过邮件或服务内通知的方式告知您。继续使用 Foundry 服务即表示您接受更新后的政策。",
  },
  {
    title: "10. 联系我们",
    content:
      "如对本隐私政策有任何疑问，请通过以下方式联系我们：邮箱 privacy@foundry.ai。",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#000] text-white flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          {/* 页面标题 */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible">
            <h1 className="text-3xl font-light tracking-tight sm:text-4xl">
              隐私政策
            </h1>
            <p className="mt-3 text-sm text-white/40">
              最后更新：2026 年 5 月 19 日
            </p>
            <p className="mt-6 text-sm leading-relaxed text-white/50">
              Foundry（以下简称"我们"）深知个人信息对您的重要性，并会尽全力保护您的个人信息安全。本隐私政策适用于 Foundry 一人公司操作系统的所有服务。
            </p>
          </motion.div>

          {/* 分隔线 */}
          <div className="my-10 border-t border-white/[0.06]" />

          {/* 内容 */}
          <div className="space-y-10">
            {sections.map((section, i) => (
              <motion.div
                key={section.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                <h2 className="text-base font-medium text-white">
                  {section.title}
                </h2>
                <p className="mt-3 text-sm leading-[1.8] text-white/45">
                  {section.content}
                </p>
              </motion.div>
            ))}
          </div>

          {/* 底部链接 */}
          <div className="mt-16 border-t border-white/[0.06] pt-8">
            <div className="flex items-center gap-6 text-sm">
              <Link
                to="/terms"
                className="text-white/40 transition-colors hover:text-white/70"
              >
                服务条款
              </Link>
              <Link
                to="/about"
                className="text-white/40 transition-colors hover:text-white/70"
              >
                关于我们
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
