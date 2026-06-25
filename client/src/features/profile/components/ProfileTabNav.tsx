import type { ProfileTab } from "../constants";
import { PROFILE_TABS } from "../constants";

type ProfileTabNavProps = {
  activeTab: ProfileTab;
  onChange: (tab: ProfileTab) => void;
};

export default function ProfileTabNav({ activeTab, onChange }: ProfileTabNavProps) {
  return (
    <nav className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
      {PROFILE_TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-lg px-4 py-2 text-left transition-colors ${
              active ? "bg-[#1e3a5f] text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span className="block text-sm font-semibold">{tab.label}</span>
            <span className={`block text-[11px] ${active ? "text-blue-100" : "text-gray-400"}`}>
              {tab.subtitle}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
