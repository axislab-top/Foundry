import { HrStaffingSurveyExecutorService } from './hr-staffing-survey-executor.service.js';

describe('HrStaffingSurveyExecutorService', () => {
  const makeSvc = () =>
    new HrStaffingSurveyExecutorService(
      { getApiRpcTimeoutMs: () => 5000, getWorkerActorUserId: () => 'worker-1' } as any,
      { buildRoomContext: jest.fn() } as any,
      { send: jest.fn() } as any,
    );

  it('detects staffing survey intent', () => {
    const svc = makeSvc();
    expect(svc.isStaffingSurveyIntent('你自己去问问各个部门是否缺人')).toBe(true);
    expect(svc.isStaffingSurveyIntent('你好')).toBe(false);
  });

  it('detects HR director by name', () => {
    const svc = makeSvc();
    expect(svc.isHrDirectorAgent({ role: 'director', name: '人力资源部总监' })).toBe(true);
    expect(svc.isHrDirectorAgent({ role: 'director', name: '销售部总监' })).toBe(false);
  });
});
