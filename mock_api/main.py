# tiny mock payments api, this is the thing k6 actually load tests. no
# database, everything lives in one python list for as long as the process
# stays up, restart it and youre back to a clean slate

from __future__ import annotations

import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="mock payments api")

# every payment ever created during this process, in the order they came in.
# a real payments service would obviously use a real database with an index
# on id, this list plus the scan in find_payment() below is the one bug
# planted on purpose in this whole project, see the comment down there for why
payments: list[dict] = []
next_id = 1

# a plain python list scan on its own is way too fast to prove anything, even
# at 40000 stored payments its still sub 3ms, youd need millions of payments
# to actually see it cross a real threshold, way more than a load test should
# reasonably need to create just to make a point. this constant adds a small
# per stored payment cost on top of the real scan, standing in for what an
# actual unindexed lookup would cost against a real database at that size,
# network round trip and all. its a stand in for realism at a reasonable
# test size, the scan itself is still real, this just makes its cost visible
# without needing an unreasonable number of requests to get there
SIMULATED_SCAN_COST_PER_PAYMENT = 0.00002  # seconds, ie 20 microseconds


class CreatePaymentRequest(BaseModel):
    amount: float
    currency: str
    source: str


class SeedRequest(BaseModel):
    count: int


def find_payment(payment_id: str) -> dict | None:
    # this walks the entire list front to back every single call, so it
    # gets slower the more payments have ever been created, not just the
    # ones currently open. a dict keyed by id would make this instant
    # regardless of how many payments exist, but then thered be nothing for
    # the load test to actually catch
    time.sleep(len(payments) * SIMULATED_SCAN_COST_PER_PAYMENT)
    for payment in payments:
        if payment["id"] == payment_id:
            return payment
    return None


@app.get("/health")
def health():
    return {"status": "ok", "payments_stored": len(payments)}


@app.post("/payments", status_code=201)
def create_payment(body: CreatePaymentRequest):
    global next_id
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be positive")

    payment = {
        "id": f"pay_{next_id}",
        "amount": body.amount,
        "currency": body.currency,
        "source": body.source,
        "status": "succeeded",
        "created_at": time.time(),
    }
    payments.append(payment)
    next_id += 1
    return payment


@app.get("/payments/{payment_id}")
def get_payment(payment_id: str):
    payment = find_payment(payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="payment not found")
    return payment


@app.post("/payments/{payment_id}/refund")
def refund_payment(payment_id: str):
    payment = find_payment(payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="payment not found")
    if payment["status"] == "refunded":
        raise HTTPException(status_code=409, detail="payment already refunded")

    payment["status"] = "refunded"
    return payment


@app.post("/test/reset")
def reset():
    # also test only, wipes everything back to a clean slate. this is what
    # lets every scenario seed its own exact starting volume regardless of
    # whatever ran against this same process before it, so smoke, load, and
    # spike all get the same starting conditions every time, in any order
    global next_id
    payments.clear()
    next_id = 1
    return {"payments_stored": len(payments)}


@app.post("/test/seed")
def seed(body: SeedRequest):
    # not a real payments endpoint, a real api obviously wouldnt have this.
    # its only here so the load tests can cheaply put a realistic amount of
    # existing data in memory before the timed part of a run starts, instead
    # of spending the whole test budget on individual creates just to build
    # up volume. skips find_payment entirely so seeding itself stays fast
    global next_id
    for _ in range(body.count):
        payments.append(
            {
                "id": f"pay_{next_id}",
                "amount": 10.0,
                "currency": "usd",
                "source": "tok_visa",
                "status": "succeeded",
                "created_at": time.time(),
            }
        )
        next_id += 1
    return {"seeded": body.count, "payments_stored": len(payments)}
