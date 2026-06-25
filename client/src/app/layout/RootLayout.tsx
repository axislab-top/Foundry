import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/app/layout/Sidebar";
import TopBar from "@/app/layout/TopBar";
import MobileNav from "@/app/layout/MobileNav";
import { OnboardingProvider } from "@/features/onboarding";

export default function RootLayout() {
  return (
    <OnboardingProvider>
      <div className="flex h-screen overflow-hidden bg-[#fafafa] text-gray-900">
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-hidden pb-14 md:pb-0">
            <Suspense
              fallback={
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
                  加载中…
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </main>
        </div>
        <MobileNav />
      </div>
    </OnboardingProvider>
  );
}
