---
layout: post
title: "Running Qwen 27B on Dual H200s: Memory Math, Prefill/Decode Contention, and Workload Isolation"
date: 2026-11-25 14:30:00 +0530
excerpt: "Frontier APIs make week one easy, then break-even math, tail latency, and data-egress boundaries force you to look at self-hosting. Here are the hardware mechanics, vLLM scheduler tuning, and admission-control patterns behind running a 27B model on 2x NVIDIA H200s."
tags: [llm, vllm, infrastructure, h200, python, architecture]
reading_time: 11
---

Almost every internal AI platform starts behind a frontier API key. You ship fast, avoid managing GPUs, and only pay per token.

The trouble starts when usage moves from one experimental chat tool to twenty background pipelines, document extractors, and internal copilots. Token spend scales linearly with every prompt and retry loop, compliance asks why customer payloads are leaving the VPC, and a single upstream rate limit stalls internal queues.

At the same time, jumping straight to a multi-node GPU cluster is usually overkill—and expensive if you do not understand what actually bottlenecks LLM serving. A single **2x NVIDIA H200** server running **Qwen 27B** on **vLLM** is a surprisingly practical architecture, provided you size the host properly and isolate interactive traffic from batch jobs.

> **The Core Principle:** Self-hosting an LLM is an exercise in memory-bandwidth math and queue isolation. Raw FLOPS rarely hurt you first—KV-cache contention, prefill head-of-line blocking, and under-provisioned CPUs do.

---

## 1. The Break-Even Reality: When Self-Hosting Actually Loses Money

Before buying or reserving hardware, look honestly at utilization.

Hosted frontier APIs charge **zero idle cost**. If your company sends spiky traffic for two hours a day and leaves the GPUs idle the other twenty-two, dedicated H200s will burn more money than API tokens ever did.

Self-hosting a dedicated 2x H200 node only wins on economics when at least one of these is true:

- **Sustained baseline throughput:** Multiple internal services generate enough steady daily token volume—especially long-context RAG prompts—that fixed monthly hardware/colo cost falls below your token bill.
- **Off-peak batch absorption:** Interactive traffic runs during business hours, while async document parsing, tagging, and evals keep the GPUs busy overnight on capacity you already paid for.
- **Hard compliance boundaries:** Legal or security requirements prohibit customer PII, financial records, or proprietary code from traversing third-party inference endpoints.

If none of those apply yet, keep using APIs and focus on caching and prompt size first.

---

## 2. Memory & Bandwidth Math on 2x H200 (Why One Node Matters)

Each NVIDIA H200 provides **141 GB of HBM3e** at **4.8 TB/s** memory bandwidth. Across two GPUs connected over NVLink on a single host, you have **282 GB of fast VRAM** without ever touching cross-node networking.

### Weight Footprint vs. KV-Cache Headroom

With a ~27B parameter dense model running Tensor Parallelism across 2 GPUs (`TP=2`):

| Precision | Total Weight Footprint | Per-GPU Weights (`TP=2`) | Approximate KV-Cache + Activation Headroom per GPU (at 90% util) |
| :--- | :--- | :--- | :--- |
| **BF16** | ~54 GB | ~27 GB | ~95–100 GB |
| **FP8** | ~27 GB | ~13.5 GB | ~108–113 GB |

Those numbers explain why 2x H200s hit a sweet spot. A single 80 GB A100/H100 can fit a 27B model in FP8, or squeeze it into BF16 with very little room left for concurrent long-context requests. On 2x H200s, roughly **200+ GB of aggregate HBM3e** remains available purely for **PagedAttention KV-cache blocks** and activations.

Why does massive KV-cache headroom matter in production? Because long RAG prompts (8k–32k tokens) and multi-turn tool-calling histories chew through KV blocks fast. When KV-cache utilization hits 100%, vLLM has to **preempt** active requests—either swapping KV blocks out or evicting and recomputing them later—which immediately shows up as multi-second tail-latency spikes.

### Why Single-Node NVLink Beats Multi-Node Smaller GPUs

LLM inference splits into two phases with completely different hardware bottlenecks:

1. **Prefill (compute-bound):** Processing the input prompt tokens runs in parallel across Tensor Cores. Large prompts saturate FLOPS.
2. **Decode (memory-bandwidth-bound):** Generating each output token is sequential. For *every single token*, the GPU must stream the model weights and active KV cache from HBM into on-chip SRAM. This is why H200's **4.8 TB/s** bandwidth (compared to H100's 3.35 TB/s) directly lifts decode speed under low-to-medium batch concurrency.

With Tensor Parallelism (`TP=2`), each GPU holds half of every layer and runs an `all-reduce` synchronization twice per transformer block (after attention and after the MLP). Over intra-node NVLink, that collective is fast enough to stay hidden. Stretch Tensor Parallelism across nodes over Ethernet/TCP and every single generated token pays network RTT overhead. Keeping the 27B model on **one 2x H200 node** avoids inter-node synchronization altogether.

---

## 3. The Bottleneck Teams Miss: Host CPU, Tokenization, and FSM Masks

Teams routinely spec a box with two flagship GPUs and pair it with a cheap 16-vCPU host—then wonder why GPU utilization stalls at 35% under concurrency.

In a production vLLM + RAG deployment, the host CPU carries heavy synchronous and async work on every request:

- **Tokenizer / detokenizer overhead:** Converting 16k-token RAG payloads into token IDs and streaming detokenized chunks back over SSE.
- **vLLM V1 IPC & scheduling loops:** The API server process and the `EngineCore` process communicate over ZeroMQ; batch assembly, prefix block hashing, and continuous-batching scheduler steps run on CPU.
- **Constrained decoding / JSON schemas:** When internal pipelines request strict JSON outputs (`response_format` / tool schemas), guided-decoding engines (`xgrammar` / `outlines`) compile finite-state machines and compute token vocabulary masks on the CPU *at every decode step*. Under 50 concurrent structured-extraction calls, weak CPU cores starve the GPUs.
- **Sidecar retrieval & pre-processing:** Chunking, embedding calls, reranking, and payload scrubbing before the prompt ever hits vLLM.

In practice, pair 2x H200s with **high-clock host CPUs (48–64+ cores)**, local **NVMe storage** (loading 54 GB of weights over slow network block storage turns a pod restart into a 10-minute cold outage), and enough system RAM (256 GB+) to keep weights cached in OS page cache on container restarts.

---

## 4. Fixing Tail Latency: Chunked Prefill and Prefix Caching

Raw hardware alone does not protect interactive latency. Without explicit engine tuning, a single 24k-token document-summarization request causes **head-of-line blocking** for every user currently streaming tokens.

Here is what happens in naive continuous batching: while the GPU spends 800 ms running prefill for one huge prompt, every other active request stalls mid-sentence waiting for its next decode step.

Two vLLM features eliminate most of that jitter:

1. **Chunked Prefill (`--enable-chunked-prefill` + `--max-num-batched-tokens`):** Splits massive prefills into fixed token slices (for example, `2048` or `4096` tokens per scheduler step) and packs them alongside active decode tokens. Long prompts take slightly longer to finish prefill, while interactive users keep receiving smooth token streams.
2. **Automatic Prefix Caching (`--enable-prefix-caching`):** In PagedAttention, KV cache is stored in fixed-size token blocks (16 tokens by default). Prefix caching hashes each block by its token history. When 300 employees or 20 agent workers share the same system prompt, tool definitions, or common RAG context chunks, vLLM skips recomputing those prefill blocks entirely—cutting **Time To First Token (TTFT)** from seconds to tens of milliseconds.

A baseline production launch configuration for Qwen 27B on 2x H200s looks like this:

```bash
vllm serve Qwen/Qwen2.5-27B-Instruct \
  --tensor-parallel-size 2 \
  --dtype bfloat16 \
  --kv-cache-dtype fp8 \
  --gpu-memory-utilization 0.90 \
  --max-model-len 32768 \
  --enable-prefix-caching \
  --enable-chunked-prefill \
  --max-num-batched-tokens 4096 \
  --max-num-seqs 128 \
  --scheduling-policy priority \
  --port 8000
```

> **Note on `--kv-cache-dtype fp8`:** Quantizing the KV cache to FP8 roughly doubles your effective context capacity at virtually zero quality loss on most RAG/extraction workloads—though you should always run your own eval harness on needle-in-a-haystack and structured-JSON tasks before enabling it in production.

---

## 5. Workload Isolation: Why `"priority": 10` Alone Is Not Enough

Once a shared GPU server goes live, two conflicting traffic classes hit the same endpoint:

- **Interactive traffic:** User-facing copilots and API hooks where Time To First Token (TTFT) and Time Per Output Token (TPOT) are immediately visible.
- **Background jobs:** Async document enrichment, nightly classification, and bulk extraction that can tolerate seconds or minutes of delay.

Setting `--scheduling-policy priority` in vLLM (where lower integers schedule ahead of higher integers) solves **queue ordering**, but it does **not** solve **KV-cache saturation**. If background workers flood the engine with 100 long-context requests first, they fill the KV cache. When live user traffic arrives a second later, vLLM either stalls waiting for KV blocks to free or **preempts** running batch jobs—wasting compute you already burned.

You need **two-layer admission control**: priority inside vLLM *plus* KV-aware backpressure at your Python gateway:

<div class="mermaid">
flowchart LR
    L["Interactive Traffic (P0)"] --> G["FastAPI Inference Gateway"]
    B["Background Workers (P10)"] --> Q["Bounded Batch Gate"]
    Q -->|"Allowed only when KV usage below 75%"| G
    G -->|"Poll /metrics (kv_cache_usage_perc)"| M["vLLM Prometheus Metrics"]
    G -->|"priority=0 / priority=10"| V["vLLM (2x H200, Chunked Prefill)"]
</div>

In Python, rather than hardcoding a blind `asyncio.Semaphore`, have your gateway periodically sample vLLM's `/metrics` endpoint (`vllm:kv_cache_usage_perc` and `vllm:num_requests_waiting`) so background pipelines automatically yield whenever interactive load or KV pressure climbs:

```python
import asyncio
import time
import httpx

VLLM_BASE = "http://127.0.0.1:8000"
BATCH_SEMAPHORE = asyncio.Semaphore(12)


class KVBackpressureGuard:
    """Pauses background batch dispatch when KV cache pressure rises."""

    def __init__(self, max_kv_ratio: float = 0.75, cache_ttl: float = 1.0):
        self.max_kv_ratio = max_kv_ratio
        self.cache_ttl = cache_ttl
        self._last_checked = 0.0
        self._kv_ratio = 0.0

    async def current_kv_ratio(self, client: httpx.AsyncClient) -> float:
        now = time.monotonic()
        if now - self._last_checked < self.cache_ttl:
            return self._kv_ratio

        resp = await client.get(f"{VLLM_BASE}/metrics", timeout=2.0)
        for line in resp.text.splitlines():
            if line.startswith("vllm:kv_cache_usage_perc"):
                self._kv_ratio = float(line.rsplit(" ", 1)[-1])
                break
        self._last_checked = now
        return self._kv_ratio

    async def wait_for_headroom(self, client: httpx.AsyncClient) -> None:
        while await self.current_kv_ratio(client) >= self.max_kv_ratio:
            await asyncio.sleep(0.5)


kv_guard = KVBackpressureGuard(max_kv_ratio=0.75)


async def chat_completion(
    client: httpx.AsyncClient,
    messages: list[dict],
    *,
    is_background: bool = False,
    max_tokens: int = 1024,
) -> dict:
    payload = {
        "model": "Qwen/Qwen2.5-27B-Instruct",
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": min(max_tokens, 1024) if is_background else max_tokens,
        "priority": 10 if is_background else 0,
    }

    if not is_background:
        resp = await client.post(
            f"{VLLM_BASE}/v1/chat/completions",
            json=payload,
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()

    async with BATCH_SEMAPHORE:
        await kv_guard.wait_for_headroom(client)
        resp = await client.post(
            f"{VLLM_BASE}/v1/chat/completions",
            json=payload,
            timeout=120.0,
        )
        resp.raise_for_status()
        return resp.json()
```

Notice two subtle details here:
- **Capping `max_tokens` on batch requests** keeps runaway outputs from holding KV slots indefinitely.
- **Polling `/metrics` with a 1-second TTL** adds virtually zero overhead while keeping a dedicated ~25% KV-cache reserve for bursty live users.

---

## 6. Hard Data Boundaries & Deterministic Escalation

A 27B open-weight model handles structured JSON extraction, classification, summarization, tool routing, and grounded RAG Q&A reliably—*provided you validate each workflow against a golden eval set before cutting over from a frontier model*. Where a 27B model still struggles is deep, ambiguous, multi-hop synthesis across messy unindexed context.

If you keep an external frontier model as a fallback path for those edge cases, **enforce the data boundary in infrastructure, not prompt instructions or wiki policies**:

<div class="mermaid">
flowchart TD
    R["Incoming Service Request"] --> N{"Service in Restricted Namespace?"}
    N -->|"Yes (NetworkPolicy blocks external egress)"| L["In-House Qwen 27B (2x H200s)"]
    N -->|"No (Public / Non-PII Workload)"| S{"PII / Secret Redaction Passed?"}
    S -->|"Failed or Flagged"| L
    S -->|"Clean & Task Marked Escalatable"| F["External Frontier API (Logged for Eval)"]
</div>

Three practices keep this honest in production:

1. **Network-level egress isolation:** Services handling PII, payroll, contracts, or internal customer records run in namespaces whose Kubernetes `NetworkPolicy` (or VPC egress rules) physically cannot reach external LLM endpoints. Even a misconfigured gateway flag fails closed instead of leaking data.
2. **Explicit task allowlisting:** Only non-sensitive workflows explicitly tagged as `allow_escalation=True` after passing PII/secret scrubbing can route externally.
3. **Log escalations into your eval dataset:** Every request that had to escalate is an eval sample telling you where prompt engineering, better RAG chunking, or LoRA fine-tuning on Qwen 27B would pay off next.

---

## 7. What Actually Breaks in Operations (Observability Checklist)

Once the node is serving traffic, watch these four signals—not average GPU utilization, which is mostly a vanity metric:

- **`vllm:time_to_first_token_seconds` (P95 / P99):** Rising TTFT points to queue wait time, disabled prefix caching, or overly large `--max-num-batched-tokens` causing prefill starvation.
- **`vllm:time_per_output_token_seconds` (P95 / P99):** Rising TPOT means decode batches are contending on HBM3e bandwidth or host CPU guided-decoding masks.
- **`vllm:num_preemptions_total`:** Any sustained climb above zero means concurrent requests are outgrowing your KV cache—lower `BATCH_SEMAPHORE`, tighten `max_tokens`, or enable FP8 KV cache.
- **Kubernetes `startupProbe` timeouts:** Downloading or loading 54 GB of weights plus capturing CUDA graphs on startup easily takes 60–120 seconds. Give your `startupProbe` generous headroom so kubelet does not kill a healthy pod mid-warmup.

Self-hosting LLMs fails when teams treat a vLLM container like a stateless Flask app. Size the host CPU alongside the H200s, tune chunked prefill and prefix caching, enforce KV-aware backpressure against batch workers, and lock data boundaries at the network layer—and a single dual-H200 node will carry far more production load than most teams expect.
