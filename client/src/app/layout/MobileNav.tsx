import { useLocation, Link } from "react-router-dom";
import { MessagesSquare, ListTodo, Network, BrainCircuit } from "lucide-react";

const globalTabs = [
  { to: "/collaboration/chats", icon: MessagesSquare, label: "群聊" },
  { to: "/tasks/center", icon: ListTodo, label: "任务" },
  { to: "/organization", icon: Network, label: "组织" },
  { to: "/memory/company", icon: BrainCircuit, label: "记忆" },
];

export default function MobileNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white md:hidden">
      <div className="flex items-center justify-around px-2 py-1.5">
        {globalTabs.map((tab) => {
          const active = location.pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
                active
                  ? "text-blue-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <tab.icon className={`h-4.5 w-4.5 ${active ? "text-blue-600" : "text-gray-400"}`} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
