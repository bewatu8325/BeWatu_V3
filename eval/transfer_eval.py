#!/usr/bin/env python3
"""
eval/transfer_eval.py
================================================================================
The headline metric: does a profile learned from POD behavior predict ARENA
behavior it never saw?

This is the honest, content-recommendation framing of the spec's transfer test.
It measures whether cross-surface preference signal exists — without any
personality inference, without graph features (no leakage), time-gated.

WHAT IT DOES
  1. Loads exported behavioral events (one JSON object per line; see SCHEMA).
  2. For each user, builds a content-preference profile from POD events only,
     using strictly events before a cutoff time (no future leakage).
  3. Predicts which Arena industries the user will engage with AFTER the cutoff.
  4. Compares against a naive popularity baseline (recommend globally popular
     industries to everyone) and a tag-matching baseline (recommend whatever
     the user already did in Arenas before the cutoff).
  5. Reports precision@k / recall@k / MRR for each method.

THE BET: if the Pods-only profile beats popularity AND tag-matching on held-out
Arena engagement, cross-surface preference transfer is real and worth modeling.
If it doesn't, no amount of extra architecture will save it — and you learned
that cheaply.

USAGE
  python transfer_eval.py events.jsonl --cutoff-quantile 0.7 --k 3

EXPORT (from Firestore)
  Export users/{uid}/events to newline-delimited JSON. Each line:
  {"userId","timestamp","eventType","surface","tags":{"industry","difficultyTier"},
   "outcome","role","targetId"}
================================================================================
"""

import argparse
import json
import math
from collections import defaultdict, Counter

HALF_LIFE_DAYS = 30
MS_PER_DAY = 86_400_000

INITIATION = {"pod_created", "arena_challenge_initiated", "thread_started"}


def recency_weight(ts, now):
    age_days = max(0.0, (now - ts) / MS_PER_DAY)
    return 0.5 ** (age_days / HALF_LIFE_DAYS)


def load_events(path):
    events = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def build_pod_profile(pod_events, cutoff):
    """Industry-affinity vector from POD events strictly before cutoff (time-gated)."""
    affinity = defaultdict(float)
    for ev in pod_events:
        if ev["timestamp"] >= cutoff:
            continue  # no future leakage
        industry = (ev.get("tags") or {}).get("industry")
        if industry:
            affinity[industry] += recency_weight(ev["timestamp"], cutoff)
    total = sum(affinity.values())
    if total > 0:
        for k in affinity:
            affinity[k] /= total
    return dict(affinity)


def arena_industries_before(arena_events, cutoff):
    """Industries a user engaged with in Arenas BEFORE cutoff (for tag-match baseline)."""
    c = Counter()
    for ev in arena_events:
        if ev["timestamp"] < cutoff:
            ind = (ev.get("tags") or {}).get("industry")
            if ind:
                c[ind] += 1
    return [ind for ind, _ in c.most_common()]


def arena_industries_after(arena_events, cutoff):
    """Ground truth: industries engaged with in Arenas AFTER cutoff."""
    out = set()
    for ev in arena_events:
        if ev["timestamp"] >= cutoff:
            ind = (ev.get("tags") or {}).get("industry")
            if ind:
                out.add(ind)
    return out


def precision_recall_at_k(predicted, actual, k):
    if not actual:
        return None  # no ground truth → skip this user
    topk = predicted[:k]
    hits = sum(1 for p in topk if p in actual)
    precision = hits / k if k else 0.0
    recall = hits / len(actual)
    return precision, recall


def mrr(predicted, actual):
    if not actual:
        return None
    for i, p in enumerate(predicted, 1):
        if p in actual:
            return 1.0 / i
    return 0.0


def evaluate(events, cutoff_quantile, k):
    # Group by user and surface
    by_user = defaultdict(lambda: {"pod": [], "arena": []})
    all_ts = []
    for ev in events:
        all_ts.append(ev["timestamp"])
        surface = ev.get("surface")
        if surface == "pod":
            by_user[ev["userId"]]["pod"].append(ev)
        elif surface == "arena":
            by_user[ev["userId"]]["arena"].append(ev)

    if not all_ts:
        print("No events found.")
        return

    # Global time cutoff (time-gate everything at the same wall-clock point)
    all_ts.sort()
    cutoff = all_ts[int(len(all_ts) * cutoff_quantile)]

    # Global industry popularity (for popularity baseline), from before cutoff
    global_pop = Counter()
    for ev in events:
        if ev["timestamp"] < cutoff:
            ind = (ev.get("tags") or {}).get("industry")
            if ind:
                global_pop[ind] += 1
    popular_ranked = [ind for ind, _ in global_pop.most_common()]

    metrics = {
        "pods_profile": {"p": [], "r": [], "mrr": []},
        "tag_match":    {"p": [], "r": [], "mrr": []},
        "popularity":   {"p": [], "r": [], "mrr": []},
    }
    evaluated_users = 0

    for uid, surfaces in by_user.items():
        actual = arena_industries_after(surfaces["arena"], cutoff)
        if not actual:
            continue  # need held-out Arena behavior to score against
        evaluated_users += 1

        # Method 1: Pods-only profile → rank industries by pod affinity
        profile = build_pod_profile(surfaces["pod"], cutoff)
        pods_pred = [ind for ind, _ in sorted(profile.items(), key=lambda x: -x[1])]

        # Method 2: tag-match → what they already did in Arenas before cutoff
        tag_pred = arena_industries_before(surfaces["arena"], cutoff)

        # Method 3: popularity → same global ranking for everyone
        pop_pred = popular_ranked

        for name, pred in [("pods_profile", pods_pred), ("tag_match", tag_pred), ("popularity", pop_pred)]:
            pr = precision_recall_at_k(pred, actual, k)
            m = mrr(pred, actual)
            if pr is not None:
                metrics[name]["p"].append(pr[0])
                metrics[name]["r"].append(pr[1])
                metrics[name]["mrr"].append(m)

    # Report
    def avg(xs):
        return sum(xs) / len(xs) if xs else 0.0

    print("=" * 64)
    print(f"TRANSFER EVALUATION  —  Pods → held-out Arena (graph-free, time-gated)")
    print(f"cutoff quantile={cutoff_quantile}  k={k}  users scored={evaluated_users}")
    print("=" * 64)
    print(f"{'method':<16}{'precision@k':>14}{'recall@k':>12}{'MRR':>8}")
    print("-" * 64)
    for name in ("pods_profile", "tag_match", "popularity"):
        m = metrics[name]
        print(f"{name:<16}{avg(m['p']):>14.3f}{avg(m['r']):>12.3f}{avg(m['mrr']):>8.3f}")
    print("-" * 64)

    pods = avg(metrics["pods_profile"]["p"])
    tag = avg(metrics["tag_match"]["p"])
    pop = avg(metrics["popularity"]["p"])
    print()
    if pods > tag and pods > pop:
        lift = (pods / tag - 1) * 100 if tag > 0 else float("inf")
        print(f"✅ Pods-only profile BEATS both baselines on precision@{k}.")
        print(f"   Cross-surface preference transfer is real (+{lift:.0f}% over tag-matching).")
        print(f"   Worth building the learned sequential model next.")
    else:
        print(f"❌ Pods-only profile does NOT beat the baselines.")
        print(f"   Transfer signal is weak at Tier-1. Instrument more (Tier 2/3) before")
        print(f"   investing in the learned model — this saved you that cost.")
    print()


def main():
    ap = argparse.ArgumentParser(description="Pods→Arena transfer evaluation")
    ap.add_argument("events", help="newline-delimited JSON of behavioral events")
    ap.add_argument("--cutoff-quantile", type=float, default=0.7,
                    help="fraction of timeline used for training; rest is held out (default 0.7)")
    ap.add_argument("--k", type=int, default=3, help="top-k for precision/recall (default 3)")
    args = ap.parse_args()

    events = load_events(args.events)
    print(f"Loaded {len(events)} events.")
    evaluate(events, args.cutoff_quantile, args.k)


if __name__ == "__main__":
    main()
