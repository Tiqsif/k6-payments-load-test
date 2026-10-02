// smoke test, the smallest possible check that the api and this script both
// actually work. barely any load, a totally clean slate, this should
// always pass easily. if this one fails, somethings wrong with the setup
// itself, not with performance

import { sleep } from 'k6';
import { runPaymentFlow, resetPayments, seedPayments } from './lib/helpers.js';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  // clean slate, nothing seeded, this is meant to represent basically day
  // one of the service
  resetPayments();
  seedPayments(0);
}

export default function () {
  // the 1 second pause here is think time, standing in for the pause a
  // real person takes between actions, not a technical workaround for
  // anything. without it 2 vus stops meaning 2 concurrent people and starts
  // meaning 2 threads hammering the api as fast as it responds, which isnt
  // what smoke or load are supposed to be measuring
  runPaymentFlow();
  sleep(1);
}
