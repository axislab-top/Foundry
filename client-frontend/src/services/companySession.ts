const STORAGE_KEY = 'client_selected_company_id';

type Listener = () => void;
const listeners = new Set<Listener>();

let companyId: string | null = null;

function loadFromStorage(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export const companySession = {
  init(): void {
    companyId = loadFromStorage();
  },

  getCompanyId: (): string | null => companyId,

  setCompanyId(id: string | null): void {
    companyId = id;
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
