---
layout: post
title: "Scaling Internal APIs: Moving from REST to gRPC and Kafka"
date: 2026-08-10
categories: [System Design, Microservices, Architecture]
tags: [gRPC, Protobuf, Kafka, REST, Engineering]
---

Every microservice architecture starts the exact same way: a handful of services happily speaking JSON over HTTP. It feels like freedom. The internet runs on REST, the tooling is ubiquitous, and debugging is as simple as opening a browser tab. 

But as a system scales to dozens of services and millions of requests, that freedom becomes a critical liability. 

The core problem with REST at scale isn't that JSON is slow—though it is. The real problem is that REST relies on **implicit contracts**. You assume the downstream service is available. You assume the network is fast. You assume the other team won't introduce silent **schema drift**. 

At a certain scale, assumptions are no longer a viable engineering strategy. Here is how we fundamentally rethought our internal communication, replacing implicit trust with strict schema enforcement, and eventually, adopting asynchronous event-driven patterns.

---

## 1. REST: Implicit Contracts and the Cost of Flexibility

When you communicate via JSON, you are fundamentally trusting the other party not to break things. That trust breaks down at scale. 

You pay two hidden taxes:

* **The Schema Tax:** JSON has no native schema enforcement. If a downstream team changes `"user_id"` to `"userId"`, your code still accepts the payload. It travels across the network and violently crashes at runtime—usually at 2 AM.
* **The Compute Tax:** Sending JSON means sending the schema (the string keys) over the wire on *every single request*. You burn expensive CPU cycles parsing text into native objects.

> REST optimizes for human readability. But deep inside your internal network, machines are talking to machines. Humans aren't reading those payloads.

## 2. gRPC: Explicit Contracts and Compile-Time Safety

To stop the 2 AM outages, we realized we needed to enforce our contracts strictly, before the code ever ran. We migrated our internal core to **gRPC** and **Protocol Buffers (Protobuf)**.

With gRPC, you don't write API documentation and hope the other team reads it. You define a strict, immutable contract:

```protobuf
syntax = "proto3";

message GetUserResponse {
    string username = 1;
    string email = 2;
}
```

Protobuf strips away the keys, sending raw binary over the wire. It is drastically faster to serialize. But the real power is that this contract compiles directly into Python, Go, or Java code. If a downstream team changes a field type, your build pipeline fails instantly. **A runtime catastrophe is reduced to a compile-time error.**

### The Reality of Distribution: Private PyPI Packages

Adopting Protobuf is only half the battle; the immediate question your team will ask is: *"How do we collaborate on this schema across 50 different microservice repositories without copy-pasting code?"*

The answer is **centralized versioning**. 

1. You create a single `contracts` repository. 
2. When a PR is merged, your CI/CD pipeline compiles the `.proto` files for Python, Go, and Node.
3. The pipeline publishes them to your company's private package registry (e.g., a private PyPI server or JFrog Artifactory).

Service A and Service B simply install the contract like any other versioned dependency:

```bash
pip install mycompany-contracts==1.4.2
```

If Service B upgrades to `1.5.0`, Service A is entirely insulated from the change until they explicitly bump their version in `requirements.txt`. 

### The Golden Rule of Compatibility

This brings us to the hardest problem in distributed systems: **Backwards and Forwards Compatibility.** 

When you use JSON, renaming a field breaks every client that hasn't updated yet. Protobuf solves this mathematically because it maps data using **Field Numbers**, not string names. 

```protobuf
message GetUserResponse {
    // If you rename this to 'account_name', older clients 
    // will still parse it perfectly, because they only look at tag '1'.
    string username = 1; 
    
    // Never delete a field. If email is removed, mark it deprecated
    // and NEVER reuse the number '2' for a new field.
    string email = 2 [deprecated = true];
    
    // New fields are safely ignored by older clients
    string phone_number = 3;
}
```

Because of field numbering, an old client (`v1.4.2`) can safely consume a payload from a new server (`v1.5.0`). 
* The old client simply ignores `phone_number` (field 3) because it doesn't know what it is. 
* A new client can consume an old server's payload—the missing field just defaults to an empty string. 

> gRPC optimizes for machine efficiency and contract safety. You trade the convenience of human-readable text for the mathematical certainty that your downstream dependencies won't break at runtime. This guarantee of backwards and forwards compatibility without fear of breakage is the *actual* reason tech giants use gRPC.

### The Pagination Trap vs. gRPC Streams

When you need to move millions of records between two internal microservices (e.g., nightly financial reports or ML pipelines), REST breaks down entirely. 

Engineers naturally default to REST offset pagination (`LIMIT 50 OFFSET 1000000`). This is a trap. Lacking **mechanical sympathy** for the database engine, developers ignore that even with a perfect B-Tree index, the database must still traverse and discard 1,000,000 index nodes before returning the 50 you want, causing massive O(N) latency degradation. 

A Principal Engineer will rightly point out that you can fix the database by switching to **Cursor (Keyset) Pagination** (`WHERE id > 1000000 LIMIT 50`), utilizing the index to seek in `O(log N)` time. 

But fixing the database does not fix the network. 

If you need to move 5 million rows, Cursor Pagination forces your client to make 100,000 synchronous HTTP round-trips, destroying your internal bandwidth with TCP and TLS overhead. Conversely, without native **network backpressure**, attempting to fetch those rows in a single massive JSON payload forces the server to buffer the entire response in memory, inevitably triggering an OOM (Out of Memory) crash.

REST pagination is a UI pattern, not a data-transfer protocol. When moving mountains of data, you must stop paginating and start **streaming**.

Because gRPC is built natively on HTTP/2, it supports persistent, multiplexed connections. You can upgrade a standard RPC call to a stream simply by adding the `stream` keyword:

```protobuf
service ReportingService {
    // The 'stream' keyword changes everything.
    rpc ExportData(ExportRequest) returns (stream EmployeeRecord);
}
```

In Python, the gRPC server does not return a massive, memory-crushing list. It uses a standard generator (`yield`) to push bytes onto the wire the millisecond they leave the database cursor:

```python
def ExportData(self, request, context):
    db_cursor = fetch_from_db_in_batches(request.department_id)
    for record in db_cursor:
        # Pushed instantly over the persistent HTTP/2 connection
        yield user_pb2.EmployeeRecord(name=record.name, role=record.role)
```

The memory profile of both your client and server stays perfectly flat, whether you are transmitting 10 rows or 100 million rows. 

### The Migration Bridge: Content Negotiation

You cannot freeze product development for a six-month gRPC rewrite. You must build a bridge. 

Our bridge was **Content Negotiation**. We configured our endpoints to serve *both* JSON and Protobuf from the exact same route. 

By inspecting the client's `Accept` header, we serve blazing-fast binary to updated internal microservices, while safely falling back to human-readable JSON for legacy callers:

```python
@app.post("/api/v1/user")
async def get_user(request: Request):
    response_pb = user_pb2.GetUserResponse(username="surjit")
    
    # Mathematical certainty for internal systems
    if request.headers.get("accept") == "application/x-protobuf":
        return Response(content=response_pb.SerializeToString(), media_type="application/protobuf")
    
    # Dynamic fallback for legacy clients
    return JSONResponse(content=MessageToDict(response_pb))
```

### The gRPC Reality Check

But gRPC is not magic. It introduces a severe operational tax: **HTTP/2 Persistent Connections**. 

Because gRPC holds connections open, traditional Layer 4 load balancers (like standard Nginx) will route all traffic to a single backend pod. To adopt gRPC, you are forced to adopt Layer 7 load balancing (like Envoy or a Service Mesh) to route traffic request-by-request.

## 3. Kafka: Asynchronous Decoupling

gRPC fixed our schema and performance problems, but it shares one fatal architectural flaw with REST: **It introduces strict temporal coupling.**

If `Service A` calls `Service B` via gRPC, it holds a thread open, waiting. If `Service B` experiences a database lock and latency spikes to 5 seconds, `Service A` also spikes to 5 seconds. This cascading failure propagation unnecessarily expands your **blast radius**. Synchronous networks dangerously assume that time and availability are infinite.

When a business workflow cannot afford to block (like processing an order), you must decouple from time entirely. You introduce **Kafka**.

<div class="mermaid">
flowchart LR
    classDef good fill:#10B981,stroke:#065F46,color:#fff
    classDef node fill:#4F46E5,stroke:#312E81,color:#fff

    subgraph kafka_call ["The Temporal Buffer"]
        direction LR
        P1(Service A):::node --> K1[(Kafka Broker)]:::node -. "Absorbs latency" .-> C1(Service B):::node
    end
</div>

Kafka is not just a messaging queue; it is a highly available temporal buffer. `Service A` writes the event and immediately moves on. If `Service B` crashes, the broker simply absorbs the downtime until the consumer recovers. You have successfully isolated your **failure domains**.

### The True Cost of Asynchronous Architecture

But manipulating time has a cost. When you move to Kafka, you completely lose the concept of HTTP status codes. If `Service B` fails to process a message, it cannot return a `400 Bad Request` to `Service A`, because `Service A` has already finished its execution. 

You must pack your error domains directly into your binary payload. The cleanest pattern for this is using Protobuf's `oneof` keyword to strictly model failure states:

```protobuf
message ProcessOrderResult {
    string order_id = 1;
    
    // The compiler guarantees the result is EITHER success or error.
    // There is no ambiguity.
    oneof result {
        SuccessPayload success = 2;
        ErrorPayload error = 3;
    }
}

message ErrorPayload {
    enum ErrorCode {
        UNKNOWN = 0;
        INVENTORY_EXHAUSTED = 1;
    }
    ErrorCode code = 1;
    string debug_message = 2;
}
```

This enforces strict failure modeling, re-introducing the safety of HTTP status codes without the devastating risk of synchronous network blocking.

---

## The Takeaway

We often argue about which protocol is faster, or which is safer. But at scale, protocols are simply boundaries.

You do not choose between REST, gRPC, and Kafka. You use them to draw borders across your system:

* **REST at the Edge:** Where you must be flexible, human-readable, and interoperable with the outside world.
* **gRPC in the Core:** Where you demand mathematical certainty, extreme performance, and zero tolerance for schema drift.
* **Kafka in the Background:** Where you must decouple from time entirely, absorbing upstream failures before they cascade.

Architecture is simply knowing where one border ends, and the next begins.
