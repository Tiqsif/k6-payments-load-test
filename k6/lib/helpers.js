// shared helpers so smoke, load, and spike dont all repeat the same request
// building and checks 3 times over

import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8000';

// one full create, get, refund cycle against a single payment. this is the
// same realistic flow every scenario runs, just with a different vu and
// duration shape wrapped around it
export function runPaymentFlow() {
  const createRes = http.post(
    `${BASE_URL}/payments`,
    JSON.stringify({ amount: 29.99, currency: 'usd', source: 'tok_visa' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const created = check(createRes, {
    'create returns 201': (r) => r.status === 201,
  });
  if (!created) {
    return;
  }

  const paymentId = createRes.json('id');

  const getRes = http.get(`${BASE_URL}/payments/${paymentId}`);
  check(getRes, {
    'get returns 200': (r) => r.status === 200,
    'get returns the right payment': (r) => r.json('id') === paymentId,
  });

  const refundRes = http.post(`${BASE_URL}/payments/${paymentId}/refund`);
  check(refundRes, {
    'refund returns 200': (r) => r.status === 200,
    'refund actually marks it refunded': (r) => r.json('status') === 'refunded',
  });
}

// wipes the mock apis in memory list back to empty. every scenarios setup()
// calls this first so it always starts from the same clean state, no matter
// what ran against this same api process before it
export function resetPayments() {
  const res = http.post(`${BASE_URL}/test/reset`);
  check(res, { 'reset succeeded': (r) => r.status === 200 });
}

// seeds the api with existing payments before a scenarios timed part
// starts, so the timed metrics reflect a realistic amount of existing data
// instead of being dominated by the seeding requests themselves
export function seedPayments(count) {
  if (count <= 0) {
    return;
  }
  const res = http.post(
    `${BASE_URL}/test/seed`,
    JSON.stringify({ count }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'seed succeeded': (r) => r.status === 200 });
}
