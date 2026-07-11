---
title: "Enterprise Identity Platform"
date: 2024-02-15
excerpt: "Production-ready SSO platform implementing OIDC and OAuth 2.0 with multi-tenant isolation, RBAC, and JIT 2FA."
tags: [Python, Django, OAuth2, OIDC, PostgreSQL, Redis]
github_url: "https://github.com/surjit7/SSO-Django"
---

A production-grade Identity Provider (IdP) implementing OpenID Connect (OIDC) and OAuth 2.0 with full multi-tenant isolation, role-based access control (RBAC), and Just-In-Time (JIT) 2FA enrollment.

## What Is This Platform?

A Django-based Identity Provider (IdP) that serves as the central authentication and authorization foundation for an entire platform. It implements industry-standard OAuth2 and OpenID Connect protocols with support for three distinct authentication grant types:

- **Authorization Code Flow with PKCE** - For browser-based and mobile applications
- **Device Code Flow** - For headless devices (smart TVs, IoT, CLI tools)
- **Client Credentials Flow** - For server-to-server communication

## Key Features

- **Multi-Tenancy** - Full tenant isolation for users, applications, roles, and permissions across independent identity domains
- **OAuth2 & OpenID Connect** - Full compliance with RFC 6749 and RFC 8252 standards
- **Three Grant Types** - Authorization Code (Web), Device Code (Headless), Client Credentials (Server-to-Server)
- **JIT 2FA** - TOTP enrollment on first login with recovery codes and QR code setup
- **RS256 JWT Tokens** - Configurable tokens with public/private key signing
- **BFF Session Pattern** - Server-side token storage with session binding via `sid` cookie
- **RBAC** - Permission resolution via groups, roles, direct grants, and revocations

## Technology Stack

- **Python**, **Django** - Core framework with custom OAuth2 implementation
- **PostgreSQL** - Multi-tenant database with row-level security
- **Redis** - Session storage and token caching

## Architecture Highlights

The platform implements a production-ready identity infrastructure that other services depend on for secure authentication and authorization. It provides:

- JWKS endpoint (`/.well-known/jwks.json`) for JWT verification by resource servers
- Session binding via `_sso_sid` claim in access tokens for revocation tracking
- Configurable access token expiration and refresh token rotation
- Production-ready deployment guide with security checklist

Built for Company Confidential
