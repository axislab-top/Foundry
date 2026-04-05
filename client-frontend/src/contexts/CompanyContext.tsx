import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../modules/auth/AuthProvider';
import { listCompanies } from '../services/companiesApi';
import { companySession } from '../services/companySession';
import type { Company } from '../services/companiesApi';

interface CompanyContextValue {
  companies: Company[];
  companyId: string | null;
  setCompanyId: (id: string | null) => void;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyIdState] = useState<string | null>(() => companySession.getCompanyId());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setCompanies([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await listCompanies({ page: 1, pageSize: 100 });
      setCompanies(res.items);
      let cid = companySession.getCompanyId();
      if (!cid && res.items.length > 0) {
        cid = res.items[0].id;
        companySession.setCompanyId(cid);
      } else if (cid && !res.items.some((c) => c.id === cid) && res.items.length > 0) {
        cid = res.items[0].id;
        companySession.setCompanyId(cid);
      }
      setCompanyIdState(companySession.getCompanyId());
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load companies'));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return companySession.subscribe(() => {
      setCompanyIdState(companySession.getCompanyId());
    });
  }, []);

  const setCompanyId = useCallback((id: string | null) => {
    companySession.setCompanyId(id);
    setCompanyIdState(id);
  }, []);

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      companyId,
      setCompanyId,
      isLoading,
      error,
      refetch: load,
    }),
    [companies, companyId, setCompanyId, isLoading, error, load],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

export const useCompany = (): CompanyContextValue => {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error('useCompany must be used within CompanyProvider');
  }
  return ctx;
};
