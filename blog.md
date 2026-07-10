---
layout: default
title: Blog
permalink: /blog/
---

{% for post in site.posts %}
<article class="blog-post">
  <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
  <p class="post-meta">{{ post.date | date: "%b %d, %Y" }}</p>
  <div class="post-excerpt">
    {{ post.excerpt }}
  </div>
</article>
{% endfor %}