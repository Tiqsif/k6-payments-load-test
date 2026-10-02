# k6-payments-load-test

a k6 load testing suite against a small mock payments api built specifically
for this project. this isnt about whether one request gets the right
answer, its about whether the api stays fast and reliable once a lot of
requests hit it at once, which matters a lot more for a payments system
than it does for most kinds of apis.

## what this is showing

3 named load scenarios, smoke, load, and spike, each simulating a
different shape of traffic against a create, get, and refund payment flow.
p(95) under 500ms and an error rate under 1% are the pass bar for all 3.
one of them is expected to fail on purpose, more on that below.

```
k6-payments-load-test/
├── .github/workflows/load-test.yml   # ci, runs all 3 scenarios and uploads the summaries
├── mock_api/
│   ├── main.py                       # the api under test, no database
│   └── requirements.txt
├── k6/
│   ├── lib/helpers.js                # shared request building and checks
│   ├── smoke.js
│   ├── load.js
│   └── spike.js                      # the one thats meant to fail
└── FINDINGS.md                       # actual numbers from actually running this
```

## the mock api

`mock_api/` is a tiny fastapi app, no database, everything lives in one
python list for as long as the process stays up. 3 real endpoints,
`POST /payments` to create one, `GET /payments/{id}` to look it up,
`POST /payments/{id}/refund` to refund it, plus `/health` for readiness
checks. `/test/reset` and `/test/seed` also exist, but theyre not part of
the real payments surface, they only exist so the load tests can set up a
clean, known amount of existing data before a timed run starts.

theres one bug planted on purpose in here. both the get and the refund
routes look a payment up by scanning the whole list front to back instead
of using a dict, so the more payments have ever been created, the slower
every single lookup gets, not just the ones still open. creates stay fast
regardless of volume since they dont need to search anything. a plain
python scan alone is actually too fast to prove this within a reasonable
number of requests, still sub 3ms even at 40000 stored payments, so
theres a small deliberate per payment cost added on top in `main.py`,
standing in for what an actual unindexed lookup against a real database
would cost at that size, network round trip included. its commented
directly next to where it happens, its not a claim that plain python is
naturally that slow.

## the 3 scenarios

`k6/smoke.js` resets the api to a clean slate and runs 2 vus for 30
seconds. the smallest possible check that the api and the script both
actually work, if this one fails somethings wrong with the setup itself,
not with performance.

`k6/load.js` resets the api, seeds it with 5000 existing payments to
represent a normal amount of accumulated data, then ramps up to 20 steady
vus for a few minutes. meant to represent real expected traffic, and
meant to pass, proving the service holds up fine under normal conditions
even with the bug present.

`k6/spike.js` resets the api, seeds it with 30000 existing payments to
represent a service thats been running a long time, then throws a sudden
burst of vus at it and pulls back down. seeding that much data alone
already puts lookups right around the threshold before the burst even
starts, the sudden concurrent traffic on top of that is what pushes it
clearly over. this one is expected to fail, thats not a mistake in this
suite, its the whole reason it exists.

all 3 share `k6/lib/helpers.js` for the actual request building and
response checks so that logic isnt repeated 3 times over.

## running it locally

install k6 first, on windows thats `winget install k6.k6`, other platforms
are covered at https://k6.io/docs/get-started/installation/.

start the mock api:

```bash
pip install -r mock_api/requirements.txt
uvicorn mock_api.main:app --reload
```

then, in another terminal, run whichever scenario you want:

```bash
k6 run k6/smoke.js
k6 run k6/load.js
k6 run k6/spike.js
```

each script resets and seeds its own starting data through `/test/reset`
and `/test/seed` before its timed part begins, so you can run them in any
order, or rerun the same one over and over, and get the same starting
conditions every time.

## what happens when a threshold fails

k6 exits non zero if a threshold in a scripts `options.thresholds` gets
crossed, and prints exactly which one and by how much. `--summary-export`
writes the full run summary out as json, so the actual numbers are
inspectable after the fact instead of just scrolling back through
terminal output.

## ci

`.github/workflows/load-test.yml` starts the mock api once, installs k6,
then runs all 3 scenarios against that one running instance. smoke and
load are expected to stay green. spike runs with `continue-on-error` set,
so that one real threshold breach doesnt turn the whole workflow red,
while still actually happening and still getting captured. all 3
summaries get uploaded as a build artifact regardless of pass or fail.

## findings

see `FINDINGS.md` for the actual p95 and error rate numbers from running
this for real, plus the root cause, written after actually running it,
not guessed at ahead of time.
