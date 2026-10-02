// load test, the traffic we actually expect during normal operation. seeds
// a realistic amount of existing data first so the unindexed lookup bug is
// already contributing some latency, then runs a steady, moderate number
// of vus for a few minutes. this is meant to stay under threshold, proving
// normal traffic holds up fine even with the bug present

import { sleep } from 'k6';
import { runPaymentFlow, resetPayments, seedPayments } from './lib/helpers.js';

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // ramp up to normal traffic
    { duration: '3m', target: 20 }, // hold steady there
    { duration: '30s', target: 0 }, // ramp back down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  // 5000 represents a normal amount of data a service like this would have
  // accumulated by now, not a fresh install and not years of history either
  resetPayments();
  seedPayments(5000);
}

export default function () {
  // the 1 second pause here is think time, standing in for the pause a
  // real person takes between actions. without it, 20 vus stops meaning 20
  // concurrent people using the app normally and starts meaning 20 threads
  // hammering the api with zero pause, a much heavier and less realistic
  // load than what this scenario is meant to represent
  runPaymentFlow();
  sleep(1);
}
