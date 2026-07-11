document.addEventListener('DOMContentLoaded', function() {
  // Resume section fade-in animation on scroll
  const animateElements = document.querySelectorAll('[data-animate]');
  
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, observerOptions);
  
  animateElements.forEach(element => {
    observer.observe(element);
  });
  
  // Timeline item stagger animation
  const timelineItems = document.querySelectorAll('.resume-timeline-item');
  
  timelineItems.forEach((item, index) => {
    item.style.transitionDelay = `${index * 0.1}s`;
  });
});