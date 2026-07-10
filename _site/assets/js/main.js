document.addEventListener('DOMContentLoaded', function () {
  // Smooth scrolling for internal links
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Dark mode handling
  var themeToggle = document.getElementById('theme-toggle');
  var root = document.body;

  // Load saved preference
  var savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    root.classList.remove('theme-light');
    root.classList.add('theme-dark');
  }

  themeToggle.addEventListener('click', function () {
    if (root.classList.contains('theme-dark')) {
      root.classList.remove('theme-dark');
      root.classList.add('theme-light');
      localStorage.setItem('theme', 'light');
    } else {
      root.classList.remove('theme-light');
      root.classList.add('theme-dark');
      localStorage.setItem('theme', 'dark');
    }
  });
});