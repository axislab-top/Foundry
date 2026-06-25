import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar, Footer, fadeUp } from "./components";

const sections = [
  {
    title: "1. 服务说明",
    content:
      `Foundry 是一款 AI 驱动的一人公司操作系统（OPC），为用户提供 AI Agent 团队管理、任务自动化执行、组织治理等功能。本服务按"现状"和"可用"状态提供，我们不保证服务不会中断或完全无误。`,
  },
  {
    title: "2. 账户注册",
    content:
      "您必须年满 16 岁才能使用本服务。注册时需提供真实、准确的信息，并妥善保管账户密码。您对账户下的所有活动承担责任。如发现未经授权使用，请立即通知我们。",
  },
  {
    title: "3. 使用规范",
    content:
      "您不得利用本服务从事违法违规活动，包括但不限于：传播违法信息、侵犯他人知识产权、攻击或破坏服务系统、未经授权访问他人账户、使用自动化工具恶意调用服务。我们有权对违规行为采取警告、暂停或终止服务的措施。",
  },
  {
    title: "4. 知识产权",
    content:
      "Foundry 平台本身的代码、设计、商标等知识产权归我们所有。您通过服务创建的内容（包括任务、文档、配置等）的知识产权归您所有。您授予我们在提供服务所必需的范围内使用、存储、处理您内容的许可。",
  },
  {
    title: "5. 付费与订阅",
    content:
      "部分功能需要付费订阅。订阅费用按所选计划和周期收取，具体价格以定价页面为准。订阅自动续费，您可随时取消，取消后当前计费周期内仍可使用。除非法律要求，已支付的费用不予退还。",
  },
  {
    title: "6. AI 生成内容",
    content:
      "AI Agent 生成的内容仅供参考，不构成专业建议。您应自行判断 AI 输出内容的准确性和适用性。对于因依赖 AI 生成内容而产生的任何损失，我们不承担责任。您有义务审核和确认 AI 执行的关键操作。",
  },
  {
    title: "7. 服务变更与终止",
    content:
      "我们保留随时修改、暂停或终止服务（或其任何部分）的权利，会提前合理时间通知。您可随时停止使用服务并注销账户。在服务终止后，我们将在合理期限内提供数据导出功能。",
  },
  {
    title: "8. 免责声明",
    content:
      "在法律允许的最大范围内，Foundry 及其关联方不对以下情况承担责任：因不可抗力导致的服务中断；因第三方服务导致的数据丢失或损坏；因您违反使用规范导致的后果；间接、附带、特殊或惩罚性损害赔偿。",
  },
  {
    title: "9. 争议解决",
    content:
      "本条款受中华人民共和国法律管辖。因本条款引起的争议，双方应友好协商解决；协商不成的，任何一方可向有管辖权的人民法院提起诉讼。",
  },
  {
    title: "10. 条款修改",
    content:
      "我们可能会不时修改本条款。重大变更时，我们会提前通知您。继续使用 Foundry 服务即表示您接受修改后的条款。",
  },
  {
    title: "11. 联系方式",
    content:
      "如对本服务条款有任何疑问，请通过以下方式联系我们：邮箱 legal@foundry.ai。",
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#000] text-white flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          {/* 页面标题 */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible">
            <h1 className="text-3xl font-light tracking-tight sm:text-4xl">
              服务条款
            </h1>
            <p className="mt-3 text-sm text-white/40">
              最后更新：2026 年 5 月 19 日
            </p>
            <p className="mt-6 text-sm leading-relaxed text-white/50">
              欢迎使用 Foundry。在使用我们的服务之前，请仔细阅读以下服务条款。使用 Foundry 即表示您同意受本条款的约束。
            </p>
          </motion.div>

          {/* 分隔线 */}
          <div className="my-10 border-t border-white/[0.06]" />

          {/* 内容 */}
          <div className="space-y-10">
            {sections.map((section) => (
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
                to="/privacy"
                className="text-white/40 transition-colors hover:text-white/70"
              >
                隐私政策
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
