import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Key,
  Settings,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Plus,
  Check,
  X,
  Monitor,
  Smartphone,
  AlertCircle,
} from "lucide-react";

/* ─── 类型 ─── */

type TabKey = "permissions" | "apikeys" | "security";

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  memberCount: number;
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string;
  enabled: boolean;
}

interface LoginRecord {
  id: string;
  time: string;
  device: string;
  ip: string;
  status: "success" | "failed";
}

/* ─── 常量 ─── */

const TABS: { key: TabKey; label: string; icon: typeof ShieldCheck }[] = [
  { key: "permissions", label: "访问权限", icon: ShieldCheck },
  { key: "apikeys", label: "API 密钥", icon: Key },
  { key: "security", label: "安全设置", icon: Settings },
];

const MODULES = ["仪表盘", "任务管理", "审批中心", "Agent 管理", "财务预算"];

const PERMISSION_MATRIX: Record<string, Record<string, boolean>> = {
  "超级管理员": { "仪表盘": true, "任务管理": true, "审批中心": true, "Agent 管理": true, "财务预算": true },
  "Agent 操作员": { "仪表盘": true, "任务管理": true, "审批中心": false, "Agent 管理": true, "财务预算": false },
  "只读观察者": { "仪表盘": true, "任务管理": false, "审批中心": false, "Agent 管理": false, "财务预算": false },
};

/* ─── Mock 数据 ─── */

const INITIAL_ROLES: Role[] = [
  {
    id: "role1",
    name: "超级管理员",
    description: "拥有系统全部权限，可管理所有模块和用户。",
    permissions: ["全部权限"],
    memberCount: 1,
  },
  {
    id: "role2",
    name: "Agent 操作员",
    description: "可管理和监控 Agent，执行任务操作，但无法访问财务和审批。",
    permissions: ["仪表盘", "任务管理", "Agent 管理"],
    memberCount: 3,
  },
  {
    id: "role3",
    name: "只读观察者",
    description: "仅可查看仪表盘数据，无任何操作权限。",
    permissions: ["仪表盘（只读）"],
    memberCount: 5,
  },
];

const INITIAL_KEYS: ApiKey[] = [
  {
    id: "k1",
    name: "生产环境主密钥",
    key: "sk-prod-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    createdAt: "2026-03-15",
    lastUsed: "2026-05-13 10:30",
    enabled: true,
  },
  {
    id: "k2",
    name: "测试环境密钥",
    key: "sk-test-q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
    createdAt: "2026-04-02",
    lastUsed: "2026-05-12 16:45",
    enabled: true,
  },
  {
    id: "k3",
    name: "旧版 API 密钥（已废弃）",
    key: "sk-old-g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8",
    createdAt: "2025-11-20",
    lastUsed: "2026-02-10 09:00",
    enabled: false,
  },
];

const MOCK_LOGIN_RECORDS: LoginRecord[] = [
  { id: "lr1", time: "2026-05-13 10:15", device: "Chrome / macOS", ip: "192.168.1.101", status: "success" },
  { id: "lr2", time: "2026-05-12 22:30", device: "Safari / iPhone", ip: "10.0.0.55", status: "success" },
  { id: "lr3", time: "2026-05-12 14:00", device: "Firefox / Windows", ip: "172.16.0.23", status: "failed" },
  { id: "lr4", time: "2026-05-11 09:45", device: "Chrome / macOS", ip: "192.168.1.101", status: "success" },
  { id: "lr5", time: "2026-05-10 17:20", device: "Edge / Windows", ip: "10.0.1.88", status: "success" },
];

/* ─── 主页面 ─── */

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("permissions");

  return (
    <section className="flex flex-col gap-4 pb-6">
      {/* 标题栏 */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-gray-900">权限与安全</h2>
          <p className="mt-0.5 text-xs text-gray-500">Permissions & Security — 管理系统访问权限、API 密钥和安全设置</p>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 shadow-sm">
        <div className="flex gap-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? "text-[#1e3a5f]" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="security-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1e3a5f]"
                    transition={{ duration: 0.2 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 内容 */}
      <AnimatePresence mode="wait">
        {activeTab === "permissions" && (
          <motion.div key="permissions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <PermissionsTab />
          </motion.div>
        )}
        {activeTab === "apikeys" && (
          <motion.div key="apikeys" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <ApiKeysTab />
          </motion.div>
        )}
        {activeTab === "security" && (
          <motion.div key="security" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <SecuritySettingsTab />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ─── 访问权限 Tab ─── */

function PermissionsTab() {
  return (
    <div className="space-y-4">
      {/* 角色列表 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">角色列表</h3>
        </div>
        <div>
          {INITIAL_ROLES.map((role, index) => (
            <motion.div
              key={role.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: index * 0.05 }}
              className="flex items-center justify-between border-b border-gray-50 px-5 py-4 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-900">{role.name}</h4>
                  <span className="text-xs text-gray-400">{role.memberCount} 名成员</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{role.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {role.permissions.map((perm) => (
                    <span key={perm} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="ml-4 shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                编辑
              </button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 权限矩阵 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">权限矩阵</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">
                <th className="px-5 py-2.5">功能模块</th>
                {Object.keys(PERMISSION_MATRIX).map((role) => (
                  <th key={role} className="px-5 py-2.5 text-center">{role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, index) => (
                <motion.tr
                  key={mod}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: index * 0.03 }}
                  className="border-b border-gray-50"
                >
                  <td className="px-5 py-3 text-sm text-gray-700">{mod}</td>
                  {Object.entries(PERMISSION_MATRIX).map(([role, perms]) => (
                    <td key={role} className="px-5 py-3 text-center">
                      {perms[mod] ? (
                        <Check className="mx-auto h-4 w-4 text-green-500" />
                      ) : (
                        <X className="mx-auto h-4 w-4 text-gray-300" />
                      )}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── API 密钥 Tab ─── */

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>(INITIAL_KEYS);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");

  const toggleVisible = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = (id: string, value: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDelete = (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const handleGenerate = () => {
    if (!newKeyName.trim()) return;
    const newKey: ApiKey = {
      id: `k${Date.now()}`,
      name: newKeyName.trim(),
      key: `sk-new-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
      createdAt: "2026-05-13",
      lastUsed: "从未使用",
      enabled: true,
    };
    setKeys((prev) => [...prev, newKey]);
    setShowGenerate(false);
    setNewKeyName("");
  };

  const maskKey = (key: string) => key.slice(0, 7) + "••••••••••••••••" + key.slice(-4);

  return (
    <div className="space-y-4">
      {/* 生成按钮 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowGenerate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e]"
        >
          <Plus className="h-4 w-4" />
          生成新密钥
        </button>
      </div>

      {/* 密钥列表 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">密钥列表</h3>
        </div>
        <div>
          {keys.map((apiKey, index) => (
            <motion.div
              key={apiKey.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: index * 0.05 }}
              className="flex items-center justify-between border-b border-gray-50 px-5 py-4 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-900">{apiKey.name}</h4>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${apiKey.enabled ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"}`}>
                    {apiKey.enabled ? "启用" : "禁用"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 font-mono">
                    {visibleKeys.has(apiKey.id) ? apiKey.key : maskKey(apiKey.key)}
                  </code>
                  <button type="button" onClick={() => toggleVisible(apiKey.id)} className="text-gray-400 hover:text-gray-600">
                    {visibleKeys.has(apiKey.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400">
                  创建：{apiKey.createdAt} · 最后使用：{apiKey.lastUsed}
                </p>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(apiKey.id, apiKey.key)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                >
                  {copiedId === apiKey.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  {copiedId === apiKey.id ? "已复制" : "复制"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(apiKey.id)}
                  className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
          {keys.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Key className="h-8 w-8 mb-2 text-gray-300" />
              <p className="text-sm">暂无 API 密钥</p>
            </div>
          )}
        </div>
      </div>

      {/* 生成新密钥弹窗 */}
      <AnimatePresence>
        {showGenerate && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setShowGenerate(false)} />
            <motion.div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-6 shadow-xl" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
              <h3 className="text-base font-semibold text-gray-900">生成新密钥</h3>
              <p className="mt-1 text-xs text-gray-500">为密钥命名，便于后续识别和管理</p>
              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-gray-600">密钥名称</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="例如：生产环境密钥"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
                  onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                />
              </div>
              <div className="mt-5 flex gap-3">
                <button type="button" onClick={() => { setShowGenerate(false); setNewKeyName(""); }} className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">取消</button>
                <button type="button" onClick={handleGenerate} className="flex-1 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e]">生成</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── 安全设置 Tab ─── */

function SecuritySettingsTab() {
  const [loginNotify, setLoginNotify] = useState(true);
  const [confirmActions, setConfirmActions] = useState(true);
  const [autoLogout, setAutoLogout] = useState("30");
  const [showToast, setShowToast] = useState(false);

  const handleSave = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  return (
    <div className="space-y-4">
      {/* 安全设置表单 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-800">安全偏好</h3>
        <div className="space-y-5">
          {/* 登录通知 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">登录通知</p>
              <p className="text-xs text-gray-400">新设备登录时发送邮件通知</p>
            </div>
            <ToggleSwitch enabled={loginNotify} onChange={setLoginNotify} />
          </div>
          {/* 操作二次确认 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">操作二次确认</p>
              <p className="text-xs text-gray-400">删除、审批等关键操作前要求二次确认</p>
            </div>
            <ToggleSwitch enabled={confirmActions} onChange={setConfirmActions} />
          </div>
          {/* 自动登出 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">自动登出时间</p>
              <p className="text-xs text-gray-400">无操作后自动登出的时间</p>
            </div>
            <select
              value={autoLogout}
              onChange={(e) => setAutoLogout(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 outline-none transition-colors focus:border-blue-400 focus:bg-white"
            >
              <option value="15">15 分钟</option>
              <option value="30">30 分钟</option>
              <option value="60">1 小时</option>
              <option value="never">从不</option>
            </select>
          </div>
        </div>
        <div className="mt-6">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[#1e3a5f] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d5a8e]"
          >
            保存设置
          </button>
        </div>
      </div>

      {/* 登录记录 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">最近登录记录</h3>
        </div>
        <div>
          {MOCK_LOGIN_RECORDS.map((record, index) => (
            <motion.div
              key={record.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: index * 0.05 }}
              className="flex items-center justify-between border-b border-gray-50 px-5 py-3 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                {record.device.includes("iPhone") ? (
                  <Smartphone className="h-4 w-4 text-gray-400" />
                ) : (
                  <Monitor className="h-4 w-4 text-gray-400" />
                )}
                <div>
                  <p className="text-sm text-gray-700">{record.device}</p>
                  <p className="text-[11px] text-gray-400">{record.time}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{record.ip}</span>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${record.status === "success" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                  {record.status === "success" ? "成功" : "失败"}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 保存成功 Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 shadow-lg"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-green-700">
              <Check className="h-4 w-4" />
              保存成功
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Toggle 开关组件 ─── */

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-[#1e3a5f]" : "bg-gray-300"}`}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm"
        animate={{ x: enabled ? 20 : 0 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      />
    </button>
  );
}
