export type MarketplaceListStatusFilter = 'all' | 'published' | 'draft';

const DEFAULT_PAGE_SIZE = 20;

/** 进入详情前记录的列表位置，用于返回时恢复分页/筛选 */
export type MarketplaceListBackState = {
  pathname: string;
  page: number;
  pageSize: number;
  status: MarketplaceListStatusFilter;
  search: string;
};

export type MarketplaceDetailLocationState = {
  marketplaceListBack?: MarketplaceListBackState;
};

export function buildMarketplaceDetailState(
  listBack: MarketplaceListBackState,
): MarketplaceDetailLocationState {
  return { marketplaceListBack: listBack };
}

export function defaultMarketplaceListPath(agentCategory: string | undefined): string {
  if (agentCategory === 'ceo') return '/agent-ecosystem/marketplace/ceo';
  if (agentCategory === 'department_head') return '/agent-ecosystem/marketplace/department-head';
  return '/agent-ecosystem/marketplace/employee';
}

export function buildMarketplaceListHref(listBack: MarketplaceListBackState): string {
  const params = new URLSearchParams();
  if (listBack.page > 1) params.set('page', String(listBack.page));
  if (listBack.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(listBack.pageSize));
  if (listBack.status !== 'all') params.set('status', listBack.status);
  const search = listBack.search.trim();
  if (search) params.set('search', search);
  const query = params.toString();
  return query ? `${listBack.pathname}?${query}` : listBack.pathname;
}

export function parseMarketplaceListFromSearchParams(searchParams: URLSearchParams): {
  page: number;
  pageSize: number;
  status: MarketplaceListStatusFilter;
  search: string;
} {
  const statusRaw = searchParams.get('status');
  const status: MarketplaceListStatusFilter =
    statusRaw === 'published' || statusRaw === 'draft' ? statusRaw : 'all';

  return {
    page: Math.max(1, Number(searchParams.get('page')) || 1),
    pageSize: Math.max(1, Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE),
    status,
    search: searchParams.get('search') ?? '',
  };
}
