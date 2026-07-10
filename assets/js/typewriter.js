// Typewriter Effect for Hero Section
document.addEventListener('DOMContentLoaded', function() {
  const typewriterElement = document.getElementById('typewriter');
  if (!typewriterElement) return;

  const phrases = [
    'Building scalable LLM platforms',
    'Fine-tuning LLMs for domain-specific use cases',
    'Deploying GPU workloads on Kubernetes',
    'Modernizing legacy architectures with AI',
    'Reducing cloud costs and API latency'
  ];

  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let delay = 100;

  function type() {
    const currentPhrase = phrases[phraseIndex];
    
    if (isDeleting) {
      typewriterElement.textContent = currentPhrase.substring(0, charIndex - 1);
      charIndex--;
      delay = 50;
    } else {
      typewriterElement.textContent = currentPhrase.substring(0, charIndex + 1);
      charIndex++;
      delay = 100;
    }

    if (!isDeleting && charIndex === currentPhrase.length) {
      delay = 2000; // Pause at end
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      delay = 500;
    }

    setTimeout(type, delay);
  }

  // Start typing after a short delay
  setTimeout(type, 1000);
});

// Blinking cursor effect
document.addEventListener('DOMContentLoaded', function() {
  const cursor = document.querySelector('.hero-cursor');
  if (cursor) {
    setInterval(function() {
      cursor.style.opacity = cursor.style.opacity === '0' ? '1' : '0';
    }, 500);
  }
});