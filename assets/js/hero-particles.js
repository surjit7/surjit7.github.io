// Hero Background Particles Effect
function createHeroParticles() {
  const container = document.getElementById('heroParticles');
  if (!container) return;

  // Create particles
  const particleCount = 20;
  const colors = ['#0A66FF', '#6610F2', '#D90429'];

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    // Random position
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    
    // Random size
    const size = Math.random() * 4 + 1;
    
    // Random color
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Random animation duration
    const duration = Math.random() * 10 + 10;
    
    // Random delay
    const delay = Math.random() * 5;

    particle.style.cssText = `
      position: absolute;
      left: ${x}%;
      top: ${y}%;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: 50%;
      opacity: 0.3;
      animation: float ${duration}s ease-in-out infinite;
      animation-delay: ${delay}s;
      pointer-events: none;
    `;

    container.appendChild(particle);
  }
}

// Add CSS for animation
const style = document.createElement('style');
style.textContent = `
  @keyframes float {
    0%, 100% {
      transform: translateY(0) translateX(0);
      opacity: 0.3;
    }
    50% {
      transform: translateY(-20px) translateX(10px);
      opacity: 0.6;
    }
  }
  
  .hero-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    z-index: -1;
  }
  
  .hero-bg-gradient {
    position: absolute;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
  }
  
  .theme-dark .hero-bg-gradient {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  }
  
  .particle {
    position: absolute;
    border-radius: 50%;
  }
`;
document.head.appendChild(style);