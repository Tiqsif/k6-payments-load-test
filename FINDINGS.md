# findings

these are real numbers from actually running the 3 scenarios in this repo,
not projected or guessed at ahead of time. smoke and load ran with the 1
second think time sleep in place, spike ran without one, exactly as the
scripts in `k6/` are checked in right now.

## smoke

p(95) 16.19ms, error rate 0.00%, all 301 checks passed. comfortably under
the 500ms threshold, as expected for 2 vus against a clean, empty api.

## load

p(95) 171.69ms, error rate 0.00%, all 16412 checks passed. under the
500ms threshold, proving the api holds up fine under a normal, sustained
20 vu load even with the planted bug present.

## spike

p(95) **2.04s**, error rate 0.00%, all 7647 checks passed, threshold
**failed**. this is the one thats supposed to fail, and it did, k6 exited
with `thresholds on metrics 'http_req_duration' have been crossed`.

worth calling out, the error rate stayed at 0.00% here too. every single
request eventually got a correct response, nothing crashed and nothing
returned a wrong answer, it just got very slow. thats a latency failure,
not a reliability failure, a real and useful distinction, a monitoring
setup watching error rate alone would have missed this entirely, only
watching latency actually caught it.

## root cause

`mock_api/main.py` looks payments up with a linear scan across an in
memory list instead of a dict, with a small deliberate per stored payment
cost added on top to make that scans real world cost visible within a
reasonable number of requests, see the comment in `find_payment()`. each
scenario seeds a different amount of existing data before its timed part
starts, so the 3 results above arent 3 unrelated numbers, theyre the same
bug at 3 different data volumes:

smoke ended with about 60 payments stored (0 seeded, ~60 created during
the run itself). at that volume the simulated per payment cost is under
2ms, nowhere near enough to matter, which is exactly why smoke passed so
easily.

load ended with about 8282 payments stored (5000 seeded, ~3282 created
during the run). the simulated cost formula alone predicts roughly 166ms
at that volume, which lines up closely with the observed 171.69ms p95,
close enough that the seeded data volume alone explains basically the
entire result.

spike ended with about 31529 payments stored (30000 seeded, ~1529 created
during the run). the same formula alone predicts roughly 630ms at that
volume, but the actual observed p95 was 2.04s, over 3x higher. the gap
between the two is itself a finding, not noise, the seeded data volume
explains why lookups are slow to begin with, but the sudden jump to 150
concurrent vus on top of that adds real queueing on the api side, uvicorn
only processes so many requests at once, so once each one is individually
slow, a burst of concurrent requests starts waiting behind each other,
compounding the underlying bug with a real concurrency bottleneck. in
other words, the algorithmic bug alone gets you to "kind of slow," the
combination of the bug and a genuine traffic spike is what actually
breaks the threshold this badly.

## what this shows

3 different load shapes against the same bug produced 3 genuinely
different outcomes, fine at rest, fine under normal traffic, clearly
broken under a spike, and the spike result is worse than a naive per
request calculation alone would predict, because real concurrent load
doesnt just add up linearly, it compounds against an existing bottleneck.
thats the actual point of running smoke, load, and spike as 3 separate
scenarios instead of just one, they dont just test 3 amounts of traffic,
they can reveal genuinely different failure characteristics at each one.
