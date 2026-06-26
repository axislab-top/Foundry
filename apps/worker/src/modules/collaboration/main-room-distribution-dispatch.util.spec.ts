import { isConfirmDistributionDispatchMessage } from './main-room-distribution-dispatch.util.js';

describe('isConfirmDistributionDispatchMessage', () => {
  it('accepts distribution dispatch confirm phrases', () => {
    expect(isConfirmDistributionDispatchMessage('确认部门分工')).toBe(true);
    expect(isConfirmDistributionDispatchMessage('同意下发')).toBe(true);
    expect(isConfirmDistributionDispatchMessage('可以下发')).toBe(true);
  });

  it('accepts department-dispatch-specific phrases', () => {
    expect(isConfirmDistributionDispatchMessage('确认部门分工')).toBe(true);
    expect(isConfirmDistributionDispatchMessage('下发各部门')).toBe(true);
    expect(isConfirmDistributionDispatchMessage('同意进入部门编排')).toBe(true);
  });

  it('rejects long unrelated text', () => {
    expect(isConfirmDistributionDispatchMessage('随便聊聊部门的事情还有很多细节要改')).toBe(false);
  });

  it('accepts short colloquial confirmations', () => {
    expect(isConfirmDistributionDispatchMessage('可以了')).toBe(true);
    expect(isConfirmDistributionDispatchMessage('可以下发')).toBe(true);
  });
});
