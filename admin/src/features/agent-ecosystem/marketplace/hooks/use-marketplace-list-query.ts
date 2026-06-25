import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  parseMarketplaceListFromSearchParams,
  type MarketplaceListBackState,
  type MarketplaceListStatusFilter,
} from '../marketplace-list-navigation';

const DEFAULT_PAGE_SIZE = 20;

function writeListQueryToParams(
  params: URLSearchParams,
  query: {
    page: number;
    pageSize: number;
    status: MarketplaceListStatusFilter;
    search: string;
  },
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('page');
  next.delete('pageSize');
  next.delete('status');
  next.delete('search');

  if (query.page > 1) next.set('page', String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) next.set('pageSize', String(query.pageSize));
  if (query.status !== 'all') next.set('status', query.status);
  const search = query.search.trim();
  if (search) next.set('search', search);

  return next;
}

/** 列表分页/筛选以 URL query 为单一数据源，便于详情页返回恢复位置 */
export function useMarketplaceListQuery(listPath: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = useMemo(
    () => parseMarketplaceListFromSearchParams(searchParams),
    [searchParams],
  );

  const listBack = useMemo<MarketplaceListBackState>(
    () => ({
      pathname: listPath,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      search: query.search,
    }),
    [listPath, query.page, query.pageSize, query.status, query.search],
  );

  const patchQuery = useCallback(
    (patch: Partial<{
      page: number;
      pageSize: number;
      status: MarketplaceListStatusFilter;
      search: string;
    }>) => {
      setSearchParams(
        (prev) =>
          writeListQueryToParams(prev, {
            page: patch.page ?? query.page,
            pageSize: patch.pageSize ?? query.pageSize,
            status: patch.status ?? query.status,
            search: patch.search ?? query.search,
          }),
        { replace: true },
      );
    },
    [query.page, query.pageSize, query.status, query.search, setSearchParams],
  );

  const setPage = useCallback((page: number) => patchQuery({ page: Math.max(1, page) }), [patchQuery]);

  const setPageSize = useCallback(
    (pageSize: number) => patchQuery({ pageSize: Math.max(1, pageSize), page: 1 }),
    [patchQuery],
  );

  const setStatus = useCallback(
    (status: MarketplaceListStatusFilter) => patchQuery({ status, page: 1 }),
    [patchQuery],
  );

  const applySearch = useCallback(
    (search: string) => patchQuery({ search, page: 1 }),
    [patchQuery],
  );

  return {
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    appliedSearch: query.search,
    listBack,
    setPage,
    setPageSize,
    setStatus,
    applySearch,
  };
}
