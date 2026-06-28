import type { CompanyMembershipRole } from '../../companies/entities/company-membership.entity.js';

export type UserCompanyContextItem = {
  companyId: string;
  companyName: string;
  companyStatus: string;
  companySlug: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  relation: 'owned' | 'member';
  membershipRole?: CompanyMembershipRole;
  membershipId?: string;
  joinedAt?: string;
  creditTotal: string | null;
  creditUsed: string | null;
  creditCurrency: string | null;
};

export type UserRechargeOrderContextItem = {
  id: string;
  companyId: string;
  companyName: string | null;
  amount: string;
  currency: string;
  status: string;
  applyNote: string | null;
  createdAt: string;
};

export type UserOAuthContextItem = {
  id: string;
  provider: string;
  providerUserId: string;
  providerUsername: string | null;
  createdAt: string;
};

export type UserAdminContextStats = {
  ownedCompanyCount: number;
  memberCompanyCount: number;
  rechargeOrderCount: number;
  approvedCreditTotal: string;
};

export type UserAdminContext = {
  user: {
    id: string;
    username: string;
    email: string;
    enabled: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
  };
  ownedCompanies: UserCompanyContextItem[];
  memberCompanies: UserCompanyContextItem[];
  rechargeOrders: UserRechargeOrderContextItem[];
  oauthAccounts: UserOAuthContextItem[];
  stats: UserAdminContextStats;
};

export type UserListStats = {
  ownedCompanyCount: number;
  memberCompanyCount: number;
  rechargeOrderCount: number;
};
