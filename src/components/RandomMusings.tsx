'use client';

import { useEffect, useState, useRef } from 'react';

// Declare global autoScroller for TypeScript
declare global {
  interface Window {
    autoScroller: any;
  }
}

interface NotionEntry {
  id: string;
  title: string;
  status: string;
  content?: string;
  images?: string[];
  date: string;
  createdTime: string;
  lastEditedTime: string;
  url: string;
}

interface NotionMusingsResponse {
  musings: NotionEntry[];
  hasMore: boolean;
  nextCursor?: string;
  total: number;
}

export function RandomMusings() {
  const [musings, setMusings] = useState<NotionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);

  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]); // Track cursors for each page
  
  // Auto-scroll refs and state
  const cardRefs = useRef<{ [key: string]: HTMLElement | null }>({})
  const timersRef = useRef<{ [key: string]: { hoverTimer: NodeJS.Timeout | null, scrollInterval: NodeJS.Timeout | null, userScrolled: boolean } }>({})

  // Dispatch pagination state to navigation
  const updateNavigation = (page: number, more: boolean, isLoading: boolean) => {
    window.dispatchEvent(new CustomEvent('paginationUpdate', {
      detail: { currentPage: page, hasMore: more, loading: isLoading }
    }));
  };

  const fetchMusings = async (cursor?: string, pageIndex = 0) => {
    try {
      // 🚀 Check for preloaded data (only for first page)
      if (!cursor && pageIndex === 0) {
        const preloaded = sessionStorage.getItem('preloadedMusings');
        if (preloaded) {
          try {
            const cached = JSON.parse(preloaded);
            const age = Date.now() - cached.timestamp;
            
            // Use preloaded data if fresh (within 5 seconds)
            if (age < 5000 && cached.data && cached.data.musings) {
              console.log(`⚡ React: Using preloaded data (age: ${age}ms) - INSTANT LOAD!`);
              sessionStorage.removeItem('preloadedMusings'); // Clean up
              
              const data = cached.data;
              setMusings(data.musings || []);
              setHasMore(data.hasMore || false);
              setNextCursor(data.nextCursor || null);
              setCursors([undefined]);
              setCurrentPage(1);
              updateNavigation(1, data.hasMore || false, false);
              setLoading(false);
              return; // Skip normal fetch - data already loaded!
            } else {
              console.log('⏰ React: Preloaded data too stale, fetching fresh');
              sessionStorage.removeItem('preloadedMusings');
            }
          } catch (error) {
            console.log('⚠️ React: Invalid preloaded data, fetching fresh:', error);
            sessionStorage.removeItem('preloadedMusings');
          }
        }
      }
      
      // 📡 Normal fetch (fallback or pagination)
      setLoading(true);
      updateNavigation(currentPage, hasMore, true);
      
      const url = new URL('/api/notion-musings', window.location.origin);
      url.searchParams.set('pageSize', '6'); // Match Express.js pageSize
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }
      
      console.log(`📡 React: Fetching from API: ${url.toString()}`);
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch musings');
      }
      const data: NotionMusingsResponse = await response.json();
      
      // Always replace current musings (no appending)
      setMusings(data.musings);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      
      // Store cursor for this page to enable going back
      setCursors(prev => {
        const newCursors = [...prev];
        if (data.nextCursor && pageIndex + 1 >= newCursors.length) {
          newCursors.push(data.nextCursor);
        }
        return newCursors;
      });
      
      updateNavigation(currentPage, data.hasMore, false);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load musings');
      console.error('Error fetching musings:', err);
      updateNavigation(currentPage, false, false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMusings(undefined, 0);
    
    // Listen for pagination actions from navigation
    const handlePaginationAction = (event: CustomEvent) => {
      const action = event.detail;
      if (action === 'first') {
        resetToFirstPage();
      } else if (action === 'prev') {
        loadPrevPage();
      } else if (action === 'next') {
        loadNextPage();
      }
    };
    
    window.addEventListener('paginationAction', handlePaginationAction as EventListener);
    return () => window.removeEventListener('paginationAction', handlePaginationAction as EventListener);
  }, [currentPage, hasMore, nextCursor, loading, cursors]);

  const loadNextPage = () => {
    if (hasMore && nextCursor && !loading) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      updateNavigation(newPage, hasMore, true);
      fetchMusings(nextCursor, newPage - 1);
    }
  };

  const loadPrevPage = () => {
    if (currentPage > 1 && !loading) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      updateNavigation(newPage, hasMore, true);
      const prevCursor = cursors[newPage - 1];
      fetchMusings(prevCursor, newPage - 1);
    }
  };

  // Auto-scroll functionality
  const setupAutoScroll = (musingId: string, cardElement: HTMLElement) => {
    const contentElement = cardElement.querySelector('.musing-content') as HTMLElement
    if (!contentElement) return

    // Initialize timers for this card
    timersRef.current[musingId] = { hoverTimer: null, scrollInterval: null, userScrolled: false }
    let lastAutoScrollPosition = 0 // Track last programmatic scroll position
    let lastScrollTime = 0 // Track when user last scrolled
    let resumeTimer: NodeJS.Timeout | null = null // Timer to resume after manual scroll stops

    // Track manual scrolling using the new cross-platform utility
    const handleScroll = () => {
      if ((window as any).autoScroller) {
        (window as any).autoScroller.markUserScroll(musingId);
      }
    }

    contentElement.addEventListener('scroll', handleScroll)

    // Mouse enter - sophisticated focus + auto-scroll
    const handleMouseEnter = () => {
      const timers = timersRef.current[musingId]
      if (!timers) return

      // Focus system: grey out all other cards
      const allCards = document.querySelectorAll('.musing-card') as NodeListOf<HTMLElement>
      allCards.forEach(otherCard => {
        if (otherCard !== cardElement) {
          otherCard.style.opacity = '0.6'
        } else {
          otherCard.style.opacity = '1.0'
        }
      })

      timers.userScrolled = false
      timers.hoverTimer = setTimeout(() => {
        if (!timers.userScrolled && contentElement.scrollHeight > contentElement.clientHeight) {
          console.log('Starting cross-platform auto-scroll for:', musingId);
          // Use hardware-accelerated cross-platform scroll
          if (window.autoScroller) {
            window.autoScroller.startAutoScroll(musingId, contentElement, {
              delay: 0, // Already delayed by hoverTimer
              onComplete: () => {
                console.log('Auto-scroll completed for:', musingId);
              },
              onUserInterrupt: () => {
                timers.userScrolled = true;
              }
            });
          }
        }
      }, 1250) // 1.25-second delay
    }

    // Mouse leave - restore all cards + clean up timers  
    const handleMouseLeave = () => {
      const timers = timersRef.current[musingId]
      if (!timers) return

      // Restore all cards to full opacity
      const allCards = document.querySelectorAll('.musing-card') as NodeListOf<HTMLElement>
      allCards.forEach(anyCard => {
        anyCard.style.opacity = '1.0'
      })

      if (timers.hoverTimer) {
        clearTimeout(timers.hoverTimer)
        timers.hoverTimer = null
      }
      
      // Clean up auto-scroll using new utility
      if ((window as any).autoScroller) {
        (window as any).autoScroller.stopAutoScroll(musingId);
      }
      
      if (resumeTimer) {
        clearTimeout(resumeTimer)
        resumeTimer = null
      }
      timers.userScrolled = false
      lastAutoScrollPosition = 0
    }

    cardElement.addEventListener('mouseenter', handleMouseEnter)
    cardElement.addEventListener('mouseleave', handleMouseLeave)

    // Cleanup function
    return () => {
      contentElement.removeEventListener('scroll', handleScroll)
      cardElement.removeEventListener('mouseenter', handleMouseEnter)
      cardElement.removeEventListener('mouseleave', handleMouseLeave)
      const timers = timersRef.current[musingId]
      if (timers) {
        if (timers.hoverTimer) clearTimeout(timers.hoverTimer)
        if (timers.scrollInterval) clearInterval(timers.scrollInterval)
        delete timersRef.current[musingId]
      }
      if (resumeTimer) {
        clearTimeout(resumeTimer)
        resumeTimer = null
      }
    }
  }

  // Setup auto-scroll for all cards after render
  useEffect(() => {
    const cleanupFunctions: (() => void)[] = []
    
    musings.forEach(musing => {
      const cardElement = cardRefs.current[musing.id]
      if (cardElement) {
        const cleanup = setupAutoScroll(musing.id, cardElement)
        if (cleanup) cleanupFunctions.push(cleanup)
      }
    })

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup())
    }
  }, [musings])

  const resetToFirstPage = () => {
    if (currentPage !== 1) {
      setCurrentPage(1);
      setCursors([undefined]);
      updateNavigation(1, true, true);
      fetchMusings(undefined, 0);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-500">Loading musings...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (musings.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-500">No musings found.</div>
      </div>
    );
  }

  return (
    <div className="musings-wrapper">
      <div className="musings-container">
        {musings.map((musing) => (
          <article 
            key={musing.id} 
            className="musing-card"
            ref={(el) => { cardRefs.current[musing.id] = el }}
            onClick={() => window.open(musing.url, '_blank', 'noopener,noreferrer')}
          >
            <h2 className="musing-title">
              {musing.title}
            </h2>
            
            {/* Display images if any */}
            {musing.images && musing.images.length > 0 && (
              <div className="musing-images">
                {musing.images.map((imageUrl, index) => (
                  <img
                    key={index}
                    src={imageUrl}
                    alt={`Content image ${index + 1}`}
                    className="musing-image"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
            
            {/* Display rich content */}
            {musing.content && (
              <div className="musing-content">
                {musing.content.split('\n').map((line, index) => (
                  <span key={index}>
                    {line}
                    {index < musing.content!.split('\n').length - 1 && <br />}
                  </span>
                ))}
              </div>
            )}

          </article>
        ))}
      </div>
      

    </div>
  );
}
