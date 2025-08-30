/**
 * Cross-Platform Smooth Scroll Utility
 * Provides consistent 60fps auto-scrolling across Mac, Windows, and all browsers
 * Uses requestAnimationFrame for hardware acceleration
 */

class CrossPlatformAutoScroller {
  constructor() {
    this.activeScrollers = new Map();
    this.performanceMode = this.detectPerformanceMode();
    console.log(`🚀 AutoScroller initialized - Performance mode: ${this.performanceMode}`);
  }

  // Detect device performance capabilities
  detectPerformanceMode() {
    const cores = navigator.hardwareConcurrency || 4;
    const isWindows = navigator.platform.toLowerCase().includes('win');
    const isEdge = /Edge/.test(navigator.userAgent);
    const isOldChrome = /Chrome\/[0-7]/.test(navigator.userAgent);
    
    // Conservative approach for Windows and older browsers
    if (isWindows || isEdge || isOldChrome || cores < 4) {
      return 'conservative'; // Slower, more reliable
    }
    return 'optimal'; // Full speed
  }

  // Start auto-scrolling for an element
  startAutoScroll(elementId, element, options = {}) {
    // Stop any existing scroll for this element
    this.stopAutoScroll(elementId);

    const config = {
      pixelsPerSecond: this.performanceMode === 'optimal' ? 22 : 13, // Adaptive speed (reduced by 10%)
      delay: options.delay || 1250,
      easing: options.easing || 'easeInOutQuad',
      onComplete: options.onComplete || (() => {}),
      onUserInterrupt: options.onUserInterrupt || (() => {}),
      ...options
    };

    const scrollData = {
      element,
      config,
      startTime: null,
      userScrolled: false,
      lastAutoPosition: 0,
      animationId: null,
      delayTimeout: null,
      resumeTimeout: null
    };

    // Add hardware acceleration hint
    element.style.willChange = 'scroll-position';
    element.style.transform = 'translateZ(0)'; // Force GPU layer

    // Start after delay
    scrollData.delayTimeout = setTimeout(() => {
      if (element.scrollHeight > element.clientHeight && !scrollData.userScrolled) {
        this.beginScrollAnimation(elementId, scrollData);
      }
    }, config.delay);

    this.activeScrollers.set(elementId, scrollData);
    console.log(`🎯 AutoScroll queued for ${elementId} - Mode: ${this.performanceMode}`);
  }

  // Begin the actual scroll animation
  beginScrollAnimation(elementId, scrollData) {
    const { element, config } = scrollData;
    const maxScroll = element.scrollHeight - element.clientHeight;
    const startPosition = element.scrollTop;
    const totalDistance = maxScroll - startPosition;
    
    if (totalDistance <= 0) return;

    const duration = (totalDistance / config.pixelsPerSecond) * 1000; // Convert to ms
    scrollData.startTime = performance.now();

    console.log(`🚀 Starting hardware-accelerated scroll: ${totalDistance}px over ${duration}ms`);

    const animate = (currentTime) => {
      if (scrollData.userScrolled) {
        console.log('🛑 Auto-scroll interrupted by user');
        this.cleanupScroll(elementId, scrollData);
        return;
      }

      const elapsed = currentTime - scrollData.startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Use easing function for natural movement
      const easedProgress = this.easeInOutQuad(progress);
      const newPosition = startPosition + (totalDistance * easedProgress);
      
      scrollData.lastAutoPosition = newPosition;
      element.scrollTop = newPosition;

      if (progress < 1 && element.scrollTop < maxScroll) {
        scrollData.animationId = requestAnimationFrame(animate);
      } else {
        console.log('✅ Auto-scroll completed');
        config.onComplete();
        this.cleanupScroll(elementId, scrollData);
      }
    };

    scrollData.animationId = requestAnimationFrame(animate);
  }

  // Easing function for natural scroll movement
  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // Stop auto-scrolling for an element
  stopAutoScroll(elementId) {
    const scrollData = this.activeScrollers.get(elementId);
    if (scrollData) {
      this.cleanupScroll(elementId, scrollData);
    }
  }

  // Mark user scroll to interrupt auto-scroll
  markUserScroll(elementId) {
    const scrollData = this.activeScrollers.get(elementId);
    if (scrollData && !scrollData.userScrolled) {
      const currentPosition = scrollData.element.scrollTop;
      
      // Check if this is actually user scroll (not our programmatic scroll)
      if (Math.abs(currentPosition - scrollData.lastAutoPosition) > 2) {
        console.log('👆 User scroll detected - pausing auto-scroll');
        scrollData.userScrolled = true;
        scrollData.config.onUserInterrupt();
        
        // Cancel current animation
        if (scrollData.animationId) {
          cancelAnimationFrame(scrollData.animationId);
          scrollData.animationId = null;
        }

        // Resume after inactivity
        if (scrollData.resumeTimeout) {
          clearTimeout(scrollData.resumeTimeout);
        }
        
        scrollData.resumeTimeout = setTimeout(() => {
          console.log('🔄 Resuming auto-scroll after user inactivity');
          scrollData.userScrolled = false;
          scrollData.startTime = null;
          this.beginScrollAnimation(elementId, scrollData);
        }, 1500); // Resume after 1.5s of inactivity
      }
    }
  }

  // Clean up all timers and restore element
  cleanupScroll(elementId, scrollData) {
    if (scrollData.animationId) {
      cancelAnimationFrame(scrollData.animationId);
    }
    if (scrollData.delayTimeout) {
      clearTimeout(scrollData.delayTimeout);
    }
    if (scrollData.resumeTimeout) {
      clearTimeout(scrollData.resumeTimeout);
    }
    
    // Remove hardware acceleration hints
    if (scrollData.element) {
      scrollData.element.style.willChange = 'auto';
      scrollData.element.style.transform = '';
    }
    
    this.activeScrollers.delete(elementId);
  }

  // Clean up all active scrollers
  cleanup() {
    this.activeScrollers.forEach((scrollData, elementId) => {
      this.cleanupScroll(elementId, scrollData);
    });
  }
}

// Global instance
window.autoScroller = new CrossPlatformAutoScroller();
