export type PlatformUser = {
  id: string;
  username: string;
  email: string;
  enabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  stats?: UserListStats;
};

export type UserListStats = {
  ownedCompanyCount: number;
  memberCompanyCount: number;
  rechargeOrderCount: number;
};

export type DeletedFilter = 'false' | 'true' | 'all';

export type ListPlatformUsersFilters = {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
  enabled?: boolean;
  deleted?: DeletedFilter;
  includeStats?: boolean;
};

export type ListPlatformUsersResult = {
  items: PlatformUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CreatePlatformUserPayload = {
  username: string;
  email: string;
  password: string;
  enabled?: boolean;
};

export type UpdatePlatformUserPayload = {
  username?: string;
  email?: string;
  enabled?: boolean;
};

export type PlatformUserRow = PlatformUser & { key: string };

export type UserCompanyContextItem = {
  companyId: string;
  companyName: string;
  companyStatus: string;
  companySlug: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  relation: 'owned' | 'member';
  membershipRole?: string;
  membershipId?: string;
  joinedAt?: string;
  creditTotal: string | null;
  creditUsed: string | null;
  creditCurrency: string | null;
};

export type UserRechargeOrderSummary = {
  id: string;
  companyId: string;
  companyName: string | null;
  amount: string;
  currency: string;
  status: string;
  applyNote: string | null;
  createdAt: string;
};

export type UserOAuthAccount = {
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
  user: PlatformUser;
  ownedCompanies: UserCompanyContextItem[];
  memberCompanies: UserCompanyContextItem[];
  rechargeOrders: UserRechargeOrderSummary[];
  oauthAccounts: UserOAuthAccount[];
  stats: UserAdminContextStats;
};

export type UserMembershipsResult = {
  ownedCompanies: UserCompanyContextItem[];
  memberCompanies: UserCompanyContextItem[];
};
