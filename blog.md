---
layout: default
title: Blog
permalink: /blog/
---

<section class="blog-page-section">
  <style>
    .blog-page-section {
      padding: 64px 0 80px;
      background: #FFFFFF;
      min-height: 75vh;
    }
    .blog-page-container {
      max-width: 920px;
      margin: 0 auto;
      padding: 0 24px;
    }
    .blog-page-header {
      margin-bottom: 44px;
    }
    .blog-page-title {
      font-size: clamp(2rem, 4vw, 2.75rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      color: #111827;
      margin: 0 0 10px 0;
      line-height: 1.1;
    }
    .blog-page-subtitle {
      font-size: 1.1rem;
      color: #6B7280;
      max-width: 600px;
      margin: 0;
      line-height: 1.6;
    }
    .blog-list {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .blog-card {
      display: flex;
      gap: 28px;
      padding: 28px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 16px;
      text-decoration: none !important;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }
    .blog-card:hover {
      transform: translateY(-2px);
      border-color: #CBD5E1;
      box-shadow: 0 12px 28px -12px rgba(15, 23, 42, 0.12);
    }
    .blog-card-meta {
      flex-shrink: 0;
      width: 150px;
      padding-top: 3px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .blog-card-date {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.78rem;
      color: #4B5563;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .blog-card-readtime {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.74rem;
      color: #9CA3AF;
      font-weight: 500;
    }
    .blog-card-content {
      flex: 1;
      min-width: 0;
    }
    .blog-card-title {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0 0 8px 0;
      line-height: 1.35;
      letter-spacing: -0.015em;
      color: #111827;
      transition: color 0.2s ease;
    }
    .blog-card:hover .blog-card-title {
      color: #2563EB;
    }
    .blog-card-excerpt {
      font-size: 0.96rem;
      color: #4B5563;
      line-height: 1.6;
      margin: 0 0 16px 0;
    }
    .blog-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .blog-card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .blog-card-tag {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: 6px;
      background: #F3F4F6;
      color: #4B5563;
    }
    .blog-card-cta {
      font-size: 0.86rem;
      font-weight: 600;
      color: #2563EB;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: transform 0.2s ease;
    }
    .blog-card:hover .blog-card-cta {
      transform: translateX(3px);
    }

    @media (max-width: 640px) {
      .blog-page-section {
        padding: 40px 0 64px;
      }
      .blog-page-container {
        padding: 0 16px;
      }
      .blog-card {
        flex-direction: column;
        gap: 10px;
        padding: 20px;
      }
      .blog-card-meta {
        width: auto;
        flex-direction: row;
        align-items: center;
        gap: 12px;
        padding-top: 0;
      }
    }
  </style>

  <div class="blog-page-container">
    <div class="blog-page-header">
      <h1 class="blog-page-title">Engineering Log.</h1>
      <p class="blog-page-subtitle">
        Deep dives into distributed systems, LLM infrastructure, and production engineering. Notes from the trenches of building scalable backends.
      </p>
    </div>

    <div class="blog-list">
      {% for post in site.posts %}
        {% assign words = post.content | number_of_words %}
        {% assign mins = words | divided_by: 200 | plus: 1 %}
        <a href="{{ post.url | relative_url }}" class="blog-card">
          <div class="blog-card-meta">
            <time class="blog-card-date" datetime="{{ post.date | date_to_xmlschema }}">
              {{ post.date | date: "%b %d, %Y" }}
            </time>
            <span class="blog-card-readtime">{{ mins }} min read</span>
          </div>
          <div class="blog-card-content">
            <h2 class="blog-card-title">{{ post.title }}</h2>
            <p class="blog-card-excerpt">{{ post.excerpt | strip_html | truncatewords: 28 }}</p>
            <div class="blog-card-footer">
              {% if post.tags.size > 0 %}
              <div class="blog-card-tags">
                {% for tag in post.tags limit:3 %}
                <span class="blog-card-tag">{{ tag }}</span>
                {% endfor %}
              </div>
              {% endif %}
              <span class="blog-card-cta">Read Article &rarr;</span>
            </div>
          </div>
        </a>
      {% endfor %}
    </div>
  </div>
</section>
