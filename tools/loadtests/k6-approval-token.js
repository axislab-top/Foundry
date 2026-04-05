/**
 * k6：验证 execution token 无效/缺失时 consume 被拒绝。
 *
 * 前置：Gateway + API + RMQ；存在有效 companyId 与 Bearer。
 * 用法：
 *   k6 run -e BASE_URL=http://localhost:3000 -e COMPANY_ID=... -e AUTH_HEADER="Bearer ..." tools/loadtests/k6-approval-token.js
 */
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 20,
  duration: '20s',
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
    tokenId: '00000000-0000-4000-8000-000000000001',
    action: 'skill:fake',
  });
  const res = http.post(`${BASE}/v1/approvals/consume-token`, body, { headers });
  check(res, {
    'reject invalid token (not 200)': (r) => r.status !== 200,
  });
}
