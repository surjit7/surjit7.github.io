---
layout: post
title: "Why REST Pagination is a Trap: Scaling with gRPC Streams"
date: 2026-08-11
categories: [System Design, Microservices, Python]
tags: [gRPC, Architecture, Performance, Databases]
---

Almost every engineer learns to build APIs the exact same way: if you have a lot of data, you paginate it. You write a query with `LIMIT 50 OFFSET 0`, return a JSON array, and call it a day.

For a consumer-facing UI displaying a table of users, this is perfectly fine. 

But microservices do not just serve UIs. They run background jobs. They export millions of rows for machine learning pipelines. They generate massive nightly financial reports. 

When you attempt to move millions of records between two internal microservices using standard REST pagination, you are walking into an architectural trap that will inevitably lead to database degradation, network saturation, and OOM (Out of Memory) crashes. 

Here is why REST pagination breaks at scale, and how to fundamentally solve the problem using **gRPC Server Streaming**.

---

## 1. The Offset Trap (Why Databases Cry)

The most common way engineers implement pagination is Offset Pagination. 

```sql
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50 OFFSET 1000000;
```

This looks efficient because it only returns 50 rows. But under the hood, standard relational databases (like PostgreSQL and MySQL) do not magically skip to the 1,000,000th row. **They must scan and discard the first 1,000,000 rows** before returning the 50 you actually want. 

As the `OFFSET` grows, the query latency grows linearly (O(N)). When a background worker attempts to paginate through a massive dataset in the middle of the night, those deep offset queries will monopolize your database's CPU and disk I/O, causing collateral damage to your entire system.

### The Cursor Pagination Band-Aid
Senior engineers know to replace `OFFSET` with Cursor Pagination (Keyset Pagination):

```sql
SELECT * FROM transactions WHERE id > 1000000 ORDER BY id ASC LIMIT 50;
```

This uses a B-Tree index to instantly jump to the correct row, completely fixing the database latency problem. 

**But it does not fix the network problem.**

If you need to export 5 million rows, and you fetch them in chunks of 1,000, your client must make **5,000 synchronous HTTP round-trips**. The overhead of opening 5,000 connections, waiting for TCP slow-start, negotiating TLS, and parsing HTTP headers 5,000 times is a massive waste of internal bandwidth.

If you try to fix the network problem by fetching 100,000 rows at a time, you hit the final trap: **Memory bloat.** The server must load 100,000 objects into RAM, serialize them into a massive JSON string, and transmit it. The client must read the massive string into RAM and parse it into native objects. A slight spike in traffic will trigger the Linux OOM Killer, terminating your pods instantly.

## 2. The Solution: gRPC Server Streaming

When you need to move mountains of data, you must abandon the Request/Response paradigm entirely. 

You do not want the client to ask 5,000 times. You want the client to ask *once*, and the server to continuously push data down the pipe until it is done. 

This is exactly what **gRPC Server Streaming** was built to do.

Because gRPC uses **HTTP/2**, it supports persistent, multiplexed connections. Instead of waiting for a complete payload to be assembled in memory, the server can yield raw Protobuf bytes onto the wire the millisecond they are pulled from the database.

### Defining the Contract

In Protobuf, upgrading a standard RPC call to a stream is as simple as adding the `stream` keyword to the return type:

```protobuf
syntax = "proto3";

message ExportRequest {
    string department_id = 1;
}

message EmployeeRecord {
    string name = 1;
    string role = 2;
}

service ReportingService {
    // The 'stream' keyword changes everything.
    rpc ExportData(ExportRequest) returns (stream EmployeeRecord);
}
```

### The Server: Yielding, Not Returning

In Python, building a streaming gRPC server is incredibly elegant. You do not return a massive list of objects. You use a standard Python generator (`yield`).

```python
import user_pb2
import user_pb2_grpc

class ReportingServicer(user_pb2_grpc.ReportingServiceServicer):
    
    def ExportData(self, request, context):
        # 1. Open a cursor to the database
        db_cursor = fetch_from_db_in_batches(request.department_id)
        
        # 2. Yield items one by one. 
        # gRPC instantly streams them over the HTTP/2 connection.
        for record in db_cursor:
            yield user_pb2.EmployeeRecord(
                name=record.name, 
                role=record.role
            )
```

Because you are using `yield`, the server never holds more than one record in memory at a time. The memory profile of your application stays perfectly flat, whether you are streaming 10 rows or 100 million rows. 

### The Client: Consuming the Stream

On the client side, the developer experience is identical to iterating over a local list. The network complexity is entirely abstracted away.

```python
import user_pb2
import user_pb2_grpc
import grpc

def generate_report():
    with grpc.insecure_channel('localhost:50051') as channel:
        stub = user_pb2_grpc.ReportingServiceStub(channel)
        request = user_pb2.ExportRequest(department_id="engineering")
        
        # This returns immediately. It is an iterable stream.
        record_stream = stub.ExportData(request)
        
        # Process records as they arrive over the network
        for record in record_stream:
            write_to_csv(record.name, record.role)
```

Just like the server, the client's memory profile is completely flat. It reads one Protobuf message from the TCP buffer, processes it, and discards it. 

## The Takeaway

REST pagination is a UI pattern, not an internal data-transfer protocol. 

When you use standard REST to move massive datasets between internal services, you are forced to choose between deep-offset database destruction, extreme network round-trip overhead, or OOM crashes.

By adopting **gRPC Server Streaming**:
1. **Database Safety:** You can use a single database cursor to stream results cleanly.
2. **Network Efficiency:** You make exactly *one* HTTP/2 request, completely eliminating TCP handshake and header overhead.
3. **Memory Safety:** Both the client and the server maintain a flat memory profile using generators, completely insulating your infrastructure from memory-based crashes.

Architecture is about matching the tool to the topology. If you need to return 10 items to a web browser, use REST. If you need to pipe 10 million rows between two microservices, open a stream.
