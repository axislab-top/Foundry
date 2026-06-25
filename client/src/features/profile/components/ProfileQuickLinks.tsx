import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { QUICK_LINK_GROUPS } from "../constants";

export default function ProfileQuickLinks() {
  return (
    <div className="space-y-4">
      {QUICK_LINK_GROUPS.map((group) => (
        <section key={group.title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">{group.title}</h3>
            <p className="text-xs text-gray-400">{group.subtitle}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 transition-colors hover:border-blue-100 hover:bg-blue-50/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 transition-colors group-hover:bg-white group-hover:text-[#1e3a5f]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="truncate text-xs text-gray-500">{item.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-blue-500" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
