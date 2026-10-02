// spike test, a sudden violent jump in traffic then back down, like a flash
// sale. seeds a much bigger amount of existing data first, representing a
// service thats been running a long time, which on its own already sits
// right at the edge of the threshold before any extra traffic even hits
// it. the sudden vu surge on top of that is what pushes it clearly over.
// this one is expected to breach the threshold, thats not a mistake in
// this suite, its the whole reason it exists

import { runPaymentFlow, resetPayments, seedPayments } from './lib/helpers.js';

export const options = {
  stages: [
    { duration: '10s', target: 5 }, // normal traffic to start
    { duration: '10s', target: 150 }, // the spike itself, sudden and sharp
    { duration: '30s', target: 150 }, // hold the spike
    { duration: '10s', target: 0 }, // back down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  // 30000 represents a service thats been running a long time, this alone
  // already puts lookups right around the threshold before the spike
  // itself even starts ramping up
  resetPayments();
  seedPayments(30000);
}

export default function () {
  // no sleep here on purpose, unlike smoke and load. each vu just loops as
  // fast as the api lets it, back to back, no pause in between. thats a
  // closer match to what an actual flash sale spike looks like, real
  // users dont wait on a timer between actions
  runPaymentFlow();
}
