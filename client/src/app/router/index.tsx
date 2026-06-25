import { Suspense, lazy } from "react";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";
import RootLayout from "@/app/layout/RootLayout";
import LandingGuard from "@/app/router/LandingGuard";
import RedirectGuest from "@/app/router/RedirectGuest";
import RequireAuth from "@/app/router/RequireAuth";
import RequireCompany from "@/app/router/RequireCompany";
import AuthPage from "@/features/auth/page";
import CompanyWizardPage from "@/features/company-wizard/page";
import PlaceholderPage from "@/features/placeholder/page";

const LazyAuthPage = lazy(() => import("@/features/auth/page"));
const LazyResetPasswordPage = lazy(() => import("@/features/auth/pages/ResetPasswordPage"));
const LazyAuthCallbackPage = lazy(() => import("@/features/auth/pages/AuthCallbackPage"));
const LazyAuthErrorPage = lazy(() => import("@/features/auth/pages/AuthErrorPage"));

function GuestAuthRoute() {
  return (
    <RedirectGuest>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#020202] text-sm text-zinc-500">
            加载中…
          </div>
        }
      >
        <LazyAuthPage />
      </Suspense>
    </RedirectGuest>
  );
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <LandingGuard />,
    },
    {
      path: "/pricing",
      lazy: async () => {
        const module = await import("@/features/landing/pricing");
        return { Component: module.default };
      },
    },
    {
      path: "/cases",
      lazy: async () => {
        const module = await import("@/features/landing/cases");
        return { Component: module.default };
      },
    },
    {
      path: "/principles",
      lazy: async () => {
        const module = await import("@/features/landing/principles");
        return { Component: module.default };
      },
    },
    {
      path: "/about",
      lazy: async () => {
        const module = await import("@/features/landing/about");
        return { Component: module.default };
      },
    },
    {
      path: "/privacy",
      lazy: async () => {
        const module = await import("@/features/landing/privacy");
        return { Component: module.default };
      },
    },
    {
      path: "/terms",
      lazy: async () => {
        const module = await import("@/features/landing/terms");
        return { Component: module.default };
      },
    },
    {
      path: "/login",
      element: <GuestAuthRoute />,
    },
    {
      path: "/register",
      element: <GuestAuthRoute />,
    },
    {
      path: "/reset-password",
      element: (
        <RedirectGuest>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-[#020202] text-sm text-zinc-500">
                加载中…
              </div>
            }
          >
            <LazyResetPasswordPage />
          </Suspense>
        </RedirectGuest>
      ),
    },
    {
      path: "/auth/callback",
      element: (
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-[#020202] text-sm text-zinc-500">
              加载中…
            </div>
          }
        >
          <LazyAuthCallbackPage />
        </Suspense>
      ),
    },
    {
      path: "/auth/error",
      element: (
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-[#020202] text-sm text-zinc-500">
              加载中…
            </div>
          }
        >
          <LazyAuthErrorPage />
        </Suspense>
      ),
    },
    {
      path: "/company-select",
      element: (
        <RequireAuth>
          <AuthPage />
        </RequireAuth>
      ),
    },
    {
      path: "/company-create",
      element: (
        <RequireAuth>
          <CompanyWizardPage />
        </RequireAuth>
      ),
    },
    {
      path: "/",
      element: (
        <RequireAuth>
          <RequireCompany>
            <RootLayout />
          </RequireCompany>
        </RequireAuth>
      ),
      children: [
        {
          path: "organization",
          lazy: async () => {
            const module = await import("@/features/organization/page");
            return { Component: module.default };
          },
        },
        {
          path: "executions",
          lazy: async () => {
            const module = await import("@/features/executions/page");
            return { Component: module.default };
          },
        },
        {
          path: "home",
          element: <Navigate to="/collaboration/chats" replace />,
        },
        {
          path: "home/overview",
          element: <PlaceholderPage title="概览" />,
        },
        {
          path: "home/daily-brief",
          lazy: async () => {
            const module = await import("@/features/daily-brief/page");
            return { Component: module.default };
          },
        },
        {
          path: "departments",
          element: <Navigate to="/organization" replace />,
        },
        {
          path: "agent-team",
          lazy: async () => {
            const module = await import("@/features/agent-team/page");
            return { Component: module.default };
          },
        },
        {
          path: "ai/ceo-config",
          element: <PlaceholderPage title="CEO 配置" />,
        },
        {
          path: "ai/board",
          element: <PlaceholderPage title="董事会" />,
        },
        {
          path: "ai/department-leads",
          element: <PlaceholderPage title="部门主管" />,
        },
        {
          path: "ai/employees",
          element: <PlaceholderPage title="员工 Agent" />,
        },
        {
          path: "ai/recruitment-market",
          lazy: async () => {
            const module = await import("@/features/marketplace/page");
            return { Component: module.default };
          },
        },
        {
          path: "ai/recruitment-market/internal",
          lazy: async () => {
            const module = await import("@/features/marketplace/internal/page");
            return { Component: module.default };
          },
        },
        {
          path: "ai/recruitment-market/plugins",
          lazy: async () => {
            const module = await import("@/features/marketplace/plugins/page");
            return { Component: module.default };
          },
        },
        {
          path: "collaboration/chats",
          lazy: async () => {
            const module = await import("@/features/collaboration/chats/page");
            return { Component: module.default };
          },
        },
        {
          path: "collaboration/pending-approvals",
          lazy: async () => {
            const module = await import("@/features/approvals/pending/page");
            return { Component: module.default };
          },
        },
        {
          path: "tasks/center",
          lazy: async () => {
            const module = await import("@/features/tasks/page");
            return { Component: module.default };
          },
        },
        {
          path: "projects",
          lazy: async () => {
            const module = await import("@/features/projects/page");
            return { Component: module.default };
          },
        },
        {
          path: "tasks/logs",
          lazy: async () => {
            const module = await import("@/features/tasks/logs/page");
            return { Component: module.default };
          },
        },
        {
          path: "tasks/heartbeat",
          lazy: async () => {
            const module = await import("@/features/tasks/heartbeat/page");
            return { Component: module.default };
          },
        },
        {
          path: "tasks/schedules",
          lazy: async () => {
            const module = await import("@/features/tasks/schedules/page");
            return { Component: module.default };
          },
        },
        {
          path: "memory/company",
          lazy: async () => {
            const module = await import("@/features/memory/company/page");
            return { Component: module.default };
          },
        },
        {
          path: "memory/departments",
          lazy: async () => {
            const module = await import("@/features/memory/departments/page");
            return { Component: module.default };
          },
        },
        {
          path: "memory/agents",
          lazy: async () => {
            const module = await import("@/features/memory/agents/page");
            return { Component: module.default };
          },
        },
        {
          path: "memory/files",
          lazy: async () => {
            const module = await import("@/features/memory/files/page");
            return { Component: module.default };
          },
        },
        {
          path: "memory/graph",
          lazy: async () => {
            const module = await import("@/features/memory/graph/page");
            return { Component: module.default };
          },
        },
        {
          path: "costs",
          lazy: async () => {
            const module = await import("@/features/costs/page");
            return { Component: module.default };
          },
        },
        {
          path: "governance/billing",
          lazy: async () => {
            const module = await import("@/features/governance/billing/page");
            return { Component: module.default };
          },
        },
        {
          path: "governance/approvals",
          lazy: async () => {
            const module = await import("@/features/approvals/center/page");
            return { Component: module.default };
          },
        },
        {
          path: "governance/risk",
          lazy: async () => {
            const module = await import("@/features/governance/risk/page");
            return { Component: module.default };
          },
        },
        {
          path: "governance/audit",
          lazy: async () => {
            const module = await import("@/features/governance/audit/page");
            return { Component: module.default };
          },
        },
        {
          path: "governance/security",
          lazy: async () => {
            const module = await import("@/features/governance/security/page");
            return { Component: module.default };
          },
        },
        {
          path: "profile",
          lazy: async () => {
            const module = await import("@/features/profile/page");
            return { Component: module.default };
          },
        },
      ],
    },
    {
      path: "*",
      lazy: async () => {
        const module = await import("@/features/landing/not-found");
        return { Component: module.default };
      },
    },
  ],
);

export default function AppRouter() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
