---
layout: post
title: "Request Flow: From Browser to Python Pod"
date: 2026-07-24 10:00:00 +0530
excerpt: "The exact path a network packet takes from the public internet into a Kubernetes Python application."
tags: [kubernetes, python, networking, ingress, gunicorn]
reading_time: 5
---

# The Anatomy of a Web Request

When a user clicks a button in their browser, the request passes through multiple network boundaries and abstraction layers before your Python code ever sees it. Here is the exact architectural flow.

### The Request Flow Diagram

                    [ User's Browser ]
                            | 
                            | 1. DNS Resolution & TCP/TLS Handshake
                            v
    +-------------------------------------------------------------+
    |  Cloud Load Balancer (AWS ALB / GCP / Cloudflare)           | <-- Public Internet Boundary
    |  (Terminates public SSL, handles DDoS protection)           |
    +-------------------------------------------------------------+
                            | 
                            | 2. Forwards plain HTTP (or internal TLS)
                            v
    +=======================================================================+
    |                 Kubernetes Cluster                                    |
    |                                                                       |
    |       [ Ingress Controller (Nginx / Traefik) ]                        | <-- Cluster Boundary
    |                       | 3. Reads HTTP headers (Host, URI)             |
    |                       v                                               |
    |           [ Kubernetes Service ]                                      | <-- Internal Abstraction
    |                       | 4. kube-proxy maps to active Pod IP           |
    |                       v                                               |
    |  +-----------------------------------------------------------------+  |
    |  |            Pod (Container)                                      |  |
    |  |                    | 5. Packet enters virtual network interface |  |
    |  |                    v                                            |  |
    |  |        [ WSGI/ASGI Server (Gunicorn / Uvicorn) ]                |  | <-- HTTP to Python Translator
    |  |                    | 6. Converts raw HTTP into Python objects   |  |
    |  |                    v                                            |  |
    |  |    [ Python Framework (FastAPI / Django / Flask) ]              |  | <-- Your Code
    |  +-----------------------------------------------------------------+  |
    +=======================================================================+


### The Step-by-Step Breakdown

**Phase 1: The Public Web**
1. **DNS & Handshake:** The browser looks up your domain's IP and performs the TCP/TLS handshakes to establish a secure connection.
2. **Cloud Load Balancer:** The request hits your cloud provider's edge. This layer absorbs massive traffic spikes, terminates the public-facing SSL certificate, and forwards the raw HTTP traffic into your private network.

**Phase 2: Inside Kubernetes**
3. **Ingress Controller:** This is the "front door" of your cluster. It looks at the HTTP request (e.g., "Ah, they want `/api/users`") and determines which internal application should handle it.
4. **The Service & kube-proxy:** The Ingress routes to a Kubernetes Service. Because Pods are constantly created and destroyed, their IP addresses change. The Service acts as a static anchor, and `kube-proxy` magically routes the packet to whatever the Pod's IP happens to be right now.

**Phase 3: Inside the Pod (Python Handoff)**
5. **The Web Server (Gunicorn/Uvicorn):** Python doesn't speak raw HTTP text over TCP sockets natively. Gunicorn intercepts the HTTP request and translates it into a Python environment dictionary that your code can understand.
6. **The Framework:** Gunicorn hands that dictionary to FastAPI, Django, or Flask. Your framework routes it to your specific view function, executes your business logic, and returns a Python dictionary. Gunicorn packages that back into an HTTP `200 OK` response, and it travels all the way back up the chain to the user.

---

### FAQ: Does every request require a new TCP and TLS handshake?

If a web browser had to perform a full DNS lookup, TCP handshake, and TLS handshake for every single image, CSS file, and API call on a webpage, the internet would be painfully slow. 

Instead, modern browsers and servers use three major optimizations to skip this overhead after the very first request:

**1. TCP Keep-Alive (Keeping the Pipe Open)**
In the old days (HTTP/1.0), the server would literally hang up the phone (close the TCP socket) after sending a single file. Today, both the browser and the Load Balancer use a `Connection: keep-alive` header. Once the TCP/TLS pipe is built, they leave it open for a set amount of time (usually 60 to 120 seconds of idle time). If you request the HTML, the pipe opens. When you then request the logo image a millisecond later, the browser shoots it right down the already-open pipe. Zero handshake tax.

**2. HTTP/2 Multiplexing (Carpooling)**
Even with Keep-Alive, HTTP/1.1 had a problem: it forced requests to line up one by one (Head-of-Line Blocking). If a large image was downloading, the tiny API data had to wait behind it in the open pipe. Modern Edge proxies (like Nginx) and browsers now use **HTTP/2**. This allows *multiplexing*. The browser can send 50 different requests down the *exact same TCP/TLS connection* simultaneously, and the server can send the responses back in whatever order they finish. One handshake, dozens of simultaneous requests.

**3. TLS Session Resumption (The VIP Pass)**
Eventually, the `keep-alive` timer expires, and the server closes the TCP socket to save memory. When the user clicks another link 5 minutes later, a new TCP connection *must* be made. However, we don't want to repeat the heavy cryptographic math of a full TLS handshake. During the first TLS handshake, the server hands the browser a "Session Ticket." When the browser comes back 5 minutes later, it presents this ticket. The server recognizes it and instantly resumes the encrypted session, cutting the TLS handshake time in half. 

> **Key Takeaway:** You pay the "Handshake Tax" on the very first visit to a domain. After that, the connection is reused, multiplexed, or rapidly resumed.

### How does the Ingress Controller know which Service to route to (and which SSL cert to serve)?**
When a single Ingress Controller (like Nginx) manages traffic for `api.company.com`, `blog.company.com`, and `shop.company.com`, it faces a "Chicken and the Egg" problem. It needs to read the HTTP request to know where to route it, but it can't read the HTTP request until it decrypts the traffic—and it doesn't know which SSL certificate to use to decrypt it! 

This is solved in two distinct phases using two different headers:

* **Phase 1: The SNI Problem (Layer 6):** Before the encrypted tunnel is even built, the browser sends a `ClientHello` packet to start the TLS handshake. Inside this packet, the browser includes a cleartext extension called **SNI (Server Name Indication)** containing the hostname (`api.company.com`). The Ingress Controller reads this unencrypted SNI header, pulls the correct SSL certificate, and secures the connection.
* **Phase 2: The HTTP Host Header (Layer 7):** Now that the tunnel is secure, the Ingress Controller decrypts the payload and reads the actual HTTP request. It looks at the HTTP `Host` header (`Host: api.company.com`) and the URI path (`/users`). It matches these against the routing rules defined in your Kubernetes Ingress manifest, and finally forwards the packet to the correct internal Kubernetes Service.


### Does Layer 7 just see normal, unencrypted HTTP headers? (TLS Termination)**
Yes, exactly. This process is called **TLS Termination**. By the time your routing logic or application code looks at the request, the encryption has already been stripped away. Here is the exact lifecycle of that data:

1. **The Client (Browser):** The browser generates standard, plain-text HTTP headers (Layer 7). Before sending them over the internet, it wraps them inside a cryptographic tunnel (Layer 6) using the symmetric key agreed upon during the TLS handshake. 
2. **The Wire:** As the packet travels across the public internet, the HTTP headers and payload are complete gibberish (ciphertext). 
3. **The Edge Proxy (Nginx / ALB):** The load balancer receives the ciphertext. Because it holds the server's SSL certificate and the shared keys, it unlocks the Layer 6 box, decrypts the payload, and extracts the plain-text HTTP data.
4. **Layer 7 Routing:** The Nginx HTTP module (Layer 7) now looks at standard, unencrypted HTTP headers. It reads the `Host`, the `URI`, and the cookies, and decides which internal Kubernetes Service gets the request.

> 💡 **Staff Insight: The Internal Network Vulnerability**  
> Because the edge proxy "terminates" the TLS, the traffic flowing *behind* the load balancer (inside your Kubernetes cluster or VPC) is often sent as plain, unencrypted HTTP. If an attacker breaches your internal network, they can read all the traffic. This is why highly secure environments (like banking) require you to re-encrypt the traffic before sending it to the Pod, a pattern known as **End-to-End Encryption** or internal mTLS.

## The Packet Lifecycle: Data Encapsulation

When your browser sends a simple `GET /api/users` request, it doesn't just send those characters. As the data travels *down* the OSI layers on the client side, each layer wraps the payload in its own specific header (Encapsulation). As it travels *up* the layers on the server side, each header is stripped away (Decapsulation).

### What the Request Looks Like at Each Layer

```text
CLIENT (Going Down the Stack)                             SERVER (Going Up the Stack)

[Layer 7 - Application]                                   [Layer 7 - Application]
Payload: [ HTTP Header: GET /api/users ]                  Nginx reads the HTTP URI and routes the request.
                  |                                                 ^
                  v                                                 |
[Layer 6 - Presentation]                                  [Layer 6 - Presentation]
Payload: [ TLS Header | Encrypted HTTP Data ]             Nginx terminates TLS, unlocking the encrypted data.
                  |                                                 ^
                  v                                                 |
[Layer 4 - Transport]                                     [Layer 4 - Transport]
Payload: [ TCP Header (Src/Dst Port) | TLS | Data ]       Linux kernel reads port 443, routes to Nginx socket.
                  |                                                 ^
                  v                                                 |
[Layer 3 - Network]                                       [Layer 3 - Network]
Payload: [ IP Header | TCP Header | TLS | Data ]          Kernel processes IP Header, confirms Destination IP.
                  |                                                 ^
                  v                                                 |
[Layer 2 - Data Link]                                     [Layer 2 - Data Link]
Payload: [ MAC Header | IP Header | TCP Header ... ]      Hypervisor/Switch strips MAC Header & Frame Footer.
                  |                                                 ^
                  v                                                 |
[Layer 1 - Physical]                                      [Layer 1 - Physical]
Entire packet is converted into 1s and 0s         ->      Server's Network Interface Card (NIC) receives
and transmitted over fiber/copper as pulses.      ->      the electrical signals and reassembles the frame.
```
