import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../../services/apiClient';
import { useNewCompanyStore } from '../../../stores/newCompanyStore';
import { stepBasicSchema, stepCeoSchema, stepOrgSchema } from './schemas';
import { CompanyCreationSuccessModal } from './CompanyCreationSuccessModal';
import { StepBasicInfo } from './StepBasicInfo';
import { StepCEOPersonality } from './StepCEOPersonality';
import { StepLanding } from './StepLanding';
import { StepOrganizationPreview } from './StepOrganizationPreview';
import { StepReview } from './StepReview';
import { useCompanyCreation } from './useCompanyCreation';
import { deleteCompany } from '../../../services/companiesApi';
import { ensureWizardDraftCompanyId, abandonWizardDraftCompany } from '../../../services/wizardDraftCompany';
import './newCompanyWizard.light.css';

const WIZARD_STEP_LABELS = ['', '基本信息', '组织结构', 'CEO 行为风格', '确认与创建'];

export const NewCompanyWizard: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const entryMode = useNewCompanyStore((s) => s.entryMode);
  const step = useNewCompanyStore((s) => s.step);
  const setStep = useNewCompanyStore((s) => s.setStep);
  const setEntryMode = useNewCompanyStore((s) => s.setEntryMode);
  const draft = useNewCompanyStore((s) => s.draft);
  const resetStore = useNewCompanyStore((s) => s.reset);
  const setDraftCompanyId = useNewCompanyStore((s) => s.setDraftCompanyId);

  const { createMut, runPostCreate } = useCompanyCreation();

  const [loadingOverlay, setLoadingOverlay] = useState(false);
  const [loadingPct, setLoadingPct] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [loadingSub, setLoadingSub] = useState('');
  const [loadingStage, setLoadingStage] = useState(0);
  const [successOpen, setSuccessOpen] = useState(false);
  const [createdName, setCreatedName] = useState('');
  const createdIdRef = useRef<string | null>(null);

  const simTimerRef = useRef<number | null>(null);

  const stopSimulation = (): void => {
    if (simTimerRef.current) {
      window.clearTimeout(simTimerRef.current);
      simTimerRef.current = null;
    }
  };

  const startSimulation = (): void => {
    stopSimulation();
    const steps = [
      { pct: 20, status: '正在初始化组织结构…', sub: 'CEO Agent 上岗中' },
      { pct: 45, status: '配置部门主管…', sub: '分配职责与权限' },
      { pct: 70, status: '招募执行 Agent…', sub: '加载工具与记忆' },
      { pct: 90, status: '创建主群聊…', sub: '所有成员即将加入' },
      { pct: 100, status: '完成', sub: '准备就绪' },
    ];
    let i = 0;
    const tick = (): void => {
      if (i >= steps.length) return;
      const s = steps[i]!;
      setLoadingPct(s.pct);
      setLoadingStatus(s.status);
      setLoadingSub(s.sub);
      setLoadingStage(Math.min(i + 1, 5));
      i += 1;
      simTimerRef.current = window.setTimeout(tick, 650);
    };
    simTimerRef.current = window.setTimeout(tick, 300);
  };

  const validateStep = (s: number): boolean => {
    if (s === 1) {
      const r = stepBasicSchema.safeParse({
        name: draft.name,
        industryCode: draft.industryCode,
        scale: draft.scale,
        goal: draft.goal,
        initialBudget: draft.initialBudget,
        description: draft.description,
        timezone: draft.timezone,
        logoUrl: draft.logoUrl,
      });
      if (!r.success) {
        message.error(r.error.issues[0]?.message ?? '请完善基本信息');
        return false;
      }
    }
    if (s === 2) {
      const r = stepOrgSchema.safeParse({ orgTemplate: draft.orgTemplate });
      if (!r.success) {
        message.error('组织模板无效');
        return false;
      }
    }
    if (s === 3) {
      const r = stepCeoSchema.safeParse(draft.ceo);
      if (!r.success) {
        message.error(r.error.issues[0]?.message ?? '请完善 CEO 行为风格');
        return false;
      }
    }
    return true;
  };

  const goNext = (): void => {
    if (!validateStep(step)) return;
    if (step < 4) setStep(step + 1);
  };

  const goBack = (): void => {
    if (step < 1) return;
    if (step === 1) {
      const id = useNewCompanyStore.getState().draftCompanyId;
      void abandonWizardDraftCompany(id, deleteCompany);
      setDraftCompanyId(null);
      setEntryMode('idle');
      setStep(0);
      return;
    }
    setStep(step - 1);
  };

  const handleCreate = useCallback(async (): Promise<void> => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;

    setLoadingOverlay(true);
    setLoadingPct(0);
    setLoadingStage(0);
    startSimulation();

    try {
      const draftId = useNewCompanyStore.getState().draftCompanyId;
      if (!draftId) {
        message.error('草稿公司未就绪，请返回上一步再试或刷新页面');
        stopSimulation();
        setLoadingOverlay(false);
        return;
      }
      const created = await createMut.mutateAsync({ draftId, draft });
      createdIdRef.current = created.id;
      stopSimulation();
      setLoadingPct(100);
      setLoadingStatus('创建完成');
      setLoadingSub('正在写入 CEO 行为与人格…');
      setLoadingStage(5);
      await runPostCreate(draft, created);
      setCreatedName(created.name);
      createdIdRef.current = null;
      setLoadingOverlay(false);
      setSuccessOpen(true);
    } catch (e) {
      createdIdRef.current = null;
      stopSimulation();
      setLoadingOverlay(false);
      if (e instanceof ApiError && e.status === 409) {
        message.error(`${e.message} 建议尝试修改名称，如「${draft.name}-ai」`);
      } else {
        message.error(e instanceof Error ? e.message : '创建失败');
      }
    }
  }, [draft, createMut, runPostCreate, message]);

  const cancelCreation = useCallback(async (): Promise<void> => {
    const id = createdIdRef.current;
    setLoadingOverlay(false);
    stopSimulation();
    createdIdRef.current = null;
    const draftId = useNewCompanyStore.getState().draftCompanyId;
    resetStore();
    if (!id) {
      await abandonWizardDraftCompany(draftId, deleteCompany);
      return;
    }
    try {
      await deleteCompany(id);
    } catch {
      // Best-effort cleanup; ignore in UI.
    }
  }, [resetStore]);

  const onKey = useCallback(
    (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter' && step === 4 && !loadingOverlay) {
        ev.preventDefault();
        void handleCreate();
      }
    },
    [step, loadingOverlay, handleCreate],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  useEffect(() => () => stopSimulation(), []);

  useEffect(() => {
    if (entryMode !== 'wizard' || step < 1) {
      return;
    }
    let cancelled = false;
    void ensureWizardDraftCompanyId(
      () => useNewCompanyStore.getState().draftCompanyId,
      (id) => useNewCompanyStore.getState().setDraftCompanyId(id),
    ).catch((e) => {
      if (!cancelled) {
        message.error(e instanceof Error ? e.message : '无法初始化草稿公司');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entryMode, step, message]);

  const showTopSteps = entryMode === 'wizard' && step >= 1;

  const body = useMemo(() => {
    if (entryMode === 'idle' && step === 0) return <StepLanding />;
    if (entryMode === 'wizard') {
      if (step === 1) return <StepBasicInfo />;
      if (step === 2) return <StepOrganizationPreview />;
      if (step === 3) return <StepCEOPersonality />;
      if (step === 4) return <StepReview />;
    }
    return <StepLanding />;
  }, [entryMode, step]);

  return (
    <div className="cc-page nc-root">
      <div className="nc-header-wrap">
        <div className="nc-topbar">
          <button type="button" onClick={() => navigate(-1)} className="nc-back-btn">
            ← 返回
          </button>
          <div className="nc-logo">OrgOS</div>
          <button
            type="button"
            className="nc-top-quick"
            onClick={() => {
              setEntryMode('idle');
              setStep(0);
              window.dispatchEvent(new CustomEvent('nc:focus-quick'));
            }}
          >
            一句话极速创建
          </button>
        </div>
      </div>

      <div className="nc-body">
        {showTopSteps ? (
          <div className="step-bar" role="navigation" aria-label="创建公司步骤">
            {[1, 2, 3, 4].map((n) => (
              <React.Fragment key={n}>
                {n > 1 ? <div className="spill-div" /> : null}
                <div className={`spill ${step === n ? 'active' : ''} ${step > n ? 'done' : ''}`}>
                  <div className="spill-num">{step > n ? '✓' : n}</div>
                  <span className="spill-label">{WIZARD_STEP_LABELS[n]}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={`${entryMode}-${step}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="nc-step-panel"
          >
            {body}
          </motion.div>
        </AnimatePresence>

        {entryMode === 'wizard' && step >= 1 ? (
          <div className="footer" id="footer">
            <Button onClick={goBack} className="cc-ghost-btn btn-ghost">
              {step === 1 ? '取消向导' : '上一步'}
            </Button>
            <span className="footer-hint">预计创建 1 CEO + 3 部门 + 8 Agent</span>
            {step < 4 ? (
              <Button type="primary" className="cc-primary-btn btn-next" onClick={goNext}>
                下一步
              </Button>
            ) : (
              <Button
                type="primary"
                className="cc-primary-btn btn-next"
                loading={createMut.isPending}
                onClick={() => void handleCreate()}
              >
                创建公司（Ctrl+Enter）
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {loadingOverlay ? (
        <div className="cc-loading-overlay loading-overlay show">
          <div className="cc-loading-logo">AI 工厂</div>
          <div className="cc-loading-status">{loadingStatus}</div>
          <div className="cc-loading-sub">{loadingSub}</div>
          <div className="cc-loading-bar-outer">
            <div className="cc-loading-bar-inner" style={{ width: `${loadingPct}%` }} />
          </div>
          <div className="cc-loading-pct">{loadingPct}%</div>
          <div style={{ marginTop: 14 }}>
            <Button className="cc-ghost-btn btn-ghost" onClick={() => void cancelCreation()}>
              取消创建
            </Button>
          </div>
          <div className="prog-list">
            {[
              ['🏢', '初始化组织结构'],
              ['👑', 'CEO Agent 上岗中'],
              ['🏗️', '配置部门主管'],
              ['🤖', '招募执行 Agent'],
              ['💬', '创建主群聊'],
              ['✅', '完成，准备就绪'],
            ].map(([icon, text], idx) => (
              <div
                key={text}
                className={`prog-item ${idx < loadingStage ? 'done' : ''} ${idx === loadingStage ? 'cur' : ''}`}
              >
                <span className="prog-icon">{icon}</span>
                <span className="prog-text">{text}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <CompanyCreationSuccessModal
        open={successOpen}
        companyName={createdName}
        onClose={() => {
          setSuccessOpen(false);
          resetStore();
        }}
      />
    </div>
  );
};
