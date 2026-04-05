import { createCompanyDraft } from './companiesApi';
import { companySession } from './companySession';
import { WIZARD_DRAFT_SESSION_KEY } from '../stores/newCompanyStore';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

let ensurePromise: Promise<string> | null = null;

/**
 * 确保存在向导用草稿公司：写入 companySession（x-company-id），便于上传与下游租户校验。
 */
export async function ensureWizardDraftCompanyId(
  getDraftId: () => string | null,
  setDraftId: (id: string) => void,
): Promise<string> {
  const fromStore = getDraftId();
  if (fromStore && isUuid(fromStore)) {
    companySession.setCompanyId(fromStore);
    return fromStore;
  }

  try {
    const fromSess = sessionStorage.getItem(WIZARD_DRAFT_SESSION_KEY)?.trim();
    if (fromSess && isUuid(fromSess)) {
      setDraftId(fromSess);
      companySession.setCompanyId(fromSess);
      return fromSess;
    }
  } catch {
    /* ignore */
  }

  if (!ensurePromise) {
    ensurePromise = (async () => {
      const c = await createCompanyDraft();
      const id = c.id;
      if (!id || !isUuid(id)) {
        throw new Error('草稿公司创建失败');
      }
      setDraftId(id);
      companySession.setCompanyId(id);
      return id;
    })().finally(() => {
      ensurePromise = null;
    });
  }

  return ensurePromise;
}

/** 放弃向导：删除服务端草稿、清除本地会话与会话存储（best-effort 删除）。 */
export async function abandonWizardDraftCompany(
  draftId: string | null,
  deleteRemote: (id: string) => Promise<unknown>,
): Promise<void> {
  companySession.setCompanyId(null);
  try {
    sessionStorage.removeItem(WIZARD_DRAFT_SESSION_KEY);
  } catch {
    /* ignore */
  }
  if (draftId && isUuid(draftId)) {
    try {
      await deleteRemote(draftId);
    } catch {
      /* best-effort */
    }
  }
}
