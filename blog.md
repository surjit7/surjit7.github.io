---
layout: default
title: Blog
permalink: /blog/
---

<section class="hero-premium" style="min-height: auto !important; padding-top: 64px; padding-bottom: 40px; align-items: flex-start; background: #ffffff;">
  <div class="hero-premium-bg">
    <div class="glow-orb glow-orb-1" style="background: #3B82F6; top: -200px; right: 10%; opacity: 0.05;"></div>
  </div>
  
  <div class="container" style="width: 100%;">
    <div class="hero-premium-content" style="max-width: 800px; margin: 0 auto; text-align: left;">
      <h1 style="font-size: clamp(2rem, 4vw, 2.75rem); font-weight: 800; letter-spacing: -0.03em; color: #111827; margin-bottom: 8px; line-height: 1.1;">Engineering Log.</h1>
      <p style="font-size: 1.1rem; color: #6B7280; max-width: 600px; margin-bottom: 48px; line-height: 1.6;">
        Deep dives into distributed systems, LLM infrastructure, and production engineering. Notes from the trenches of building scalable backends.
      </p>
      
      <div class="blog-list" style="display: flex; flex-direction: column; gap: 20px;">
        {% for post in site.posts %}
        <div class="blog-card" style="padding: 24px; display: flex; gap: 24px; background: rgba(255, 255, 255, 0.6); border: 1px solid rgba(229, 231, 235, 1); border-radius: 16px; box-shadow: 0 2px 12px -4px rgba(0,0,0,0.03); transition: transform 0.2s ease, box-shadow 0.2s ease;">
          <div class="blog-card-meta" style="flex-shrink: 0; width: 130px; padding-top: 2px;">
            <time datetime="{{ post.date | date_to_xmlschema }}" style="font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.8rem; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">
              {{ post.date | date: "%b %d, %Y" }}
            </time>
          </div>
          <div class="blog-card-content" style="flex-grow: 1;">
            <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0 0 8px 0; line-height: 1.3; letter-spacing: -0.01em;">
              <a href="{{ post.url | relative_url }}" style="text-decoration: none; color: #111827; transition: color 0.2s ease;" onmouseover="this.style.color='#2563EB'" onmouseout="this.style.color='#111827'">{{ post.title }}</a>
            </h2>
            <p style="font-size: 0.95rem; color: #4B5563; line-height: 1.6; margin: 0 0 16px 0;">{{ post.excerpt | strip_html | truncatewords: 25 }}</p>
            <a href="{{ post.url | relative_url }}" style="font-size: 0.85rem; font-weight: 600; color: #2563EB; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">Read Article &rarr;</a>
          </div>
        </div>
        {% endfor %}
      </div>
    </div>
  </div>
</section>