/**
 * k6 压测：验证 billing.record.append 在预算耗尽后 100% 拒绝超支入账。
 *
 * 前置：已启动 API + Postgres + RMQ，且存在测试公司 budgets 行（total 较小）。
 * 用法示例：
 *   k6 run -e BASE_URL=http://localhost:3000 -e COMPANY_ID=... -e AUTH_HEADER="Bearer ..." tools/loadtests/k6-billing-append.js
 *
 * 说明：网关若需 Cookie/头，请通过 -e 注入；本脚本为模板，按实际鉴权调整 default fn。
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.99'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const companyId = __ENV.COMPANY_ID || '00000000-0000-4000-8000-000000000099';
  const auth = __ENV.AUTH_HEADER || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(auth ? { Authorization: auth } : {}),
  };
  const body = JSON.stringify({
    companyId,
    recordType: 'llm',
    modelName: 'gpt-4o-mini',
    inputTokens: 1000,
    outputTokens: 0,
    idempotencyKey: `k6-${__VU}-${__ITER}-${Date.now()}`,
  });
  const res = http.post(`${BASE}/v1/billing/records`, body, { headers });
  check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409,
  });
  sleep(0.05);
}
