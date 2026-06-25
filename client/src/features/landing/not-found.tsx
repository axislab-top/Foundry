import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar, Footer, fadeUp } from "./components";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#000] text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center pt-16">
        <motion.div
          className="mx-auto max-w-xl px-6 text-center"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
        >
          {/* 404 数字 */}
          <div className="text-[120px] font-light leading-none tracking-[-8px] text-white/10 sm:text-[160px]">
            404
          </div>

          {/* 提示文字 */}
          <h1 className="mt-4 text-2xl font-medium text-white">页面不存在</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/45">
            你访问的页面可能已被移除、更名，或暂时不可用。
          </p>

          {/* 返回按钮 */}
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              to="/"
              className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-white/90"
            >
              返回首页
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-white/20 px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:border-white/40 hover:text-white"
            >
              去登录
            </Link>
          </div>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
