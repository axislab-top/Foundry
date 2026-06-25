import { motion } from "framer-motion";
import { Building2, Shield, UserCircle } from "lucide-react";
import ProfileHero from "./components/ProfileHero";
import ProfileTabNav from "./components/ProfileTabNav";
import ProfileQuickLinks from "./components/ProfileQuickLinks";
import ProfileWorkspaces from "./components/ProfileWorkspaces";
import ProfileSecurity from "./components/ProfileSecurity";
import { useProfilePage } from "./hooks/useProfilePage";

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof UserCircle;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-lg font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{hint}</p>
    </div>
  );
}

export default function ProfilePage() {
  const {
    activeTab,
    setActiveTab,
    profile,
    displayName,
    avatarLabel,
    roleLabel,
    accountTypeLabel,
    activeCompany,
    onSelectCompany,
    companies,
    companyCount,
    companiesLoading,
    companiesError,
    creationQuota,
    loggingOut,
    resetSending,
    resetMessage,
    handleLogout,
    handleRequestPasswordReset,
    deleteTarget,
    deleteSubmitting,
    deleteError,
    onOpenDeleteCompany,
    onCloseDeleteCompany,
    onConfirmDeleteCompany,
  } = useProfilePage();

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4 pb-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <ProfileHero
          displayName={displayName}
          avatarLabel={avatarLabel}
          roleLabel={roleLabel}
          profile={profile}
          companyCount={companiesLoading ? 0 : companyCount}
          activeCompanyName={activeCompany?.name}
        />
      </motion.div>

      <ProfileTabNav activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" ? (
        <motion.div
          key="overview"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={UserCircle} label="账号角色" value={roleLabel} hint="Role" />
            <StatCard icon={Building2} label="工作空间" value={String(companyCount)} hint="Workspaces" />
            <StatCard icon={Shield} label="账号类型" value={accountTypeLabel} hint="Account Type" />
          </div>
          <ProfileQuickLinks />
        </motion.div>
      ) : null}

      {activeTab === "workspaces" ? (
        <motion.div
          key="workspaces"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ProfileWorkspaces
            companies={companies}
            loading={companiesLoading}
            hasError={companiesError}
            activeCompanyId={activeCompany?.id}
            creationQuota={creationQuota}
            deleteTarget={deleteTarget}
            deleteSubmitting={deleteSubmitting}
            deleteError={deleteError}
            onSelectCompany={onSelectCompany}
            onOpenDeleteCompany={onOpenDeleteCompany}
            onCloseDeleteCompany={onCloseDeleteCompany}
            onConfirmDeleteCompany={onConfirmDeleteCompany}
          />
        </motion.div>
      ) : null}

      {activeTab === "security" ? (
        <motion.div
          key="security"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ProfileSecurity
            profile={profile}
            accountTypeLabel={accountTypeLabel}
            resetSending={resetSending}
            resetMessage={resetMessage}
            loggingOut={loggingOut}
            onRequestPasswordReset={() => void handleRequestPasswordReset()}
            onLogout={() => void handleLogout()}
          />
        </motion.div>
      ) : null}
    </section>
  );
}
