'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ThresholdControl } from './ThresholdControl';
import { useEffect, useState, useRef } from 'react';

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [paginationData, setPaginationData] = useState<{
    currentPage: number;
    hasMore: boolean;
    loading: boolean;
  } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isReverseAnimating, setIsReverseAnimating] = useState(false);
  const prevPathname = useRef(pathname);
  
  const isRandomMusingsPage = pathname === '/random-musings';
  
  // Listen for pagination events from RandomMusings component
  useEffect(() => {
    if (isRandomMusingsPage) {
      const handlePaginationUpdate = (event: CustomEvent) => {
        setPaginationData(event.detail);
      };
      
      window.addEventListener('paginationUpdate', handlePaginationUpdate as EventListener);
      return () => window.removeEventListener('paginationUpdate', handlePaginationUpdate as EventListener);
    }
  }, [isRandomMusingsPage]);

  // Handle animation when entering/leaving Random Musings
  useEffect(() => {
    const wasRandomMusingsPage = prevPathname.current === '/random-musings';
    const isEnteringRandomMusings = isRandomMusingsPage && !wasRandomMusingsPage;
    const isLeavingRandomMusings = !isRandomMusingsPage && wasRandomMusingsPage;
    
    if (isEnteringRandomMusings) {
      setIsAnimating(true);
      setIsReverseAnimating(false);
      const timer = setTimeout(() => setIsAnimating(false), 1500);
      return () => clearTimeout(timer);
    } else if (isLeavingRandomMusings) {
      setIsReverseAnimating(true);
      setIsAnimating(false);
      const timer = setTimeout(() => setIsReverseAnimating(false), 1500);
      return () => clearTimeout(timer);
    }
    
    // Update previous pathname
    prevPathname.current = pathname;
  }, [isRandomMusingsPage, pathname]);

  // Handle dynamic centering and Cloudinary handler cleanup for Random Musings
  useEffect(() => {
    if (isRandomMusingsPage && !isReverseAnimating) {
      // 🛡️ Disable any global Cloudinary handlers to prevent backup images
      const container = document.getElementById('container');
      const imageContainer = document.getElementById('images-container');
      
      if (container && (window as any).handleCursorMove) {
        container.removeEventListener('mousemove', (window as any).handleCursorMove);
        console.log('🚫 Disabled Cloudinary handlers for clean React transition');
      }
      
      if (imageContainer && (window as any).handleCursorMove) {
        imageContainer.removeEventListener('mousemove', (window as any).handleCursorMove);
      }
      
      // 🎯 Apply viewport-based centering to Random Musings (matches animation)
      const timer = setTimeout(() => {
        const randomMusingsElement = document.querySelector('[href="/random-musings"]');
        if (randomMusingsElement) {
          try {
            const viewportWidth = window.innerWidth;
            const itemRect = randomMusingsElement.getBoundingClientRect();
            const itemCenter = itemRect.left + (itemRect.width / 2);
            const viewportCenter = viewportWidth / 2;
            const centerOffset = viewportCenter - itemCenter;
            
            (randomMusingsElement as HTMLElement).style.transform = `translateX(${centerOffset}px)`;
            console.log(`🎯 React viewport centering: offset=${centerOffset}px (matches animation)`);
          } catch (error) {
            console.log('⚠️ React centering failed', error);
          }
        }
      }, 50); // Small delay to ensure DOM is ready
      
      return () => clearTimeout(timer);
    }
  }, [isRandomMusingsPage, isReverseAnimating]);
  const sections = [
    { name: 'Featured', path: '/' },
    { name: 'BnW', path: '/bnw' },
    { name: 'About', path: '/about' },
    { name: 'Random Musings', path: '/random-musings', extraSpace: true },
    { name: 'Info', path: '/info' },
  ];

  // Handle reverse animation when clicking "The Final Shot" from Random Musings
  const handleFinalShotClick = (e: React.MouseEvent) => {
    if (isRandomMusingsPage) {
      e.preventDefault();
      setIsReverseAnimating(true);
      setIsAnimating(false);
      
      // Preload the home page
      const preloadLink = document.createElement('link');
      preloadLink.rel = 'prefetch';
      preloadLink.href = '/';
      document.head.appendChild(preloadLink);
      
      // Navigate after animation
      setTimeout(() => {
        router.push('/');
      }, 250);
    }
  };

    return (
    <nav className="fixed top-0 left-0 right-0 p-4 flex items-center justify-between bg-white/80 backdrop-blur-sm z-50">
      <div className="flex items-center space-x-1">
        <Link
          href="/"
          onClick={handleFinalShotClick}
          className="hover:opacity-60 transition-opacity duration-[250ms]"
        >
          The Final Shot
        </Link>
        <div className={`flex items-center space-x-1 transition-all ${isReverseAnimating ? 'duration-[250ms]' : 'duration-[1500ms]'} ${
          isRandomMusingsPage && !isReverseAnimating ? 'nav-hidden' : 'nav-visible'
        }`}>
          {sections.map((section, index) => {
            if (section.path === '/random-musings') {
              const handleRandomMusingsClick = (e: React.MouseEvent) => {
                // 🚀 IMMEDIATELY start API fetch (parallel with Next.js navigation)
                if (!isRandomMusingsPage) {
                  console.log('🚀 Starting Next.js preload fetch during navigation...');
                  fetch('/api/notion-musings?pageSize=6')
                    .then(response => response.json())
                    .then(data => {
                      // Store preloaded data for instant component load
                      sessionStorage.setItem('preloadedMusings', JSON.stringify({
                        data: data,
                        timestamp: Date.now(),
                        pageIndex: 0
                      }));
                      console.log('💾 Next.js preloaded musings data cached');
                    })
                    .catch(error => {
                      console.log('⚠️ Next.js preload failed, will fallback to normal fetch:', error);
                      sessionStorage.removeItem('preloadedMusings');
                    });
                }
              };

              return (
                <span key={section.path} className="mobile-hide-random-musings">
                  {index > 0 && <span className="text-neutral-400">,</span>}
                  <Link
                    href={section.path}
                    onClick={handleRandomMusingsClick}
                                                                          className={`${section.extraSpace ? 'ml-4' : 'ml-1'} hover:opacity-60 transition-all ${isReverseAnimating ? 'duration-[250ms]' : 'duration-[1500ms]'} ${
                             pathname === section.path ? 'opacity-40' : ''
                           } ${isRandomMusingsPage && !isReverseAnimating ? 'nav-center' : ''}`}
                  >
                    {section.name}
                  </Link>
                </span>
              );
            }
            
            return (
                                   <span
                       key={section.path}
                       className={`transition-all ${isReverseAnimating ? 'duration-[250ms]' : 'duration-[1500ms]'} ${
                         isRandomMusingsPage && !isReverseAnimating 
                           ? (section.name === 'About' ? 'nav-fade-about' : 
                              section.name === 'BnW' ? 'nav-fade-bnw' :
                              section.name === 'Featured' ? 'nav-fade-featured' : 'nav-fade-out')
                           : 'nav-visible'
                       }`}
              >
                {index > 0 && <span className="text-neutral-400">,</span>}
                <Link
                  href={section.path}
                  className={`${section.extraSpace ? 'ml-4' : 'ml-1'} hover:opacity-60 transition-opacity ${
                    pathname === section.path ? 'opacity-40' : ''
                  }`}
                >
                  {section.name}
                </Link>
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex items-center space-x-2">
                     {isRandomMusingsPage && !isReverseAnimating && paginationData && (
               <div className={`pagination-nav flex items-center space-x-1 mr-4 transition-all ${isReverseAnimating ? 'duration-[250ms]' : 'duration-[1500ms]'} nav-fade-in`}>
            <span className="text-xs text-neutral-500">
              {paginationData.currentPage}
            </span>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('paginationAction', { detail: 'first' }))}
              disabled={paginationData.currentPage === 1 || paginationData.loading}
              className="nav-pagination-btn"
              title="First page"
            >
              ⇤
            </button>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('paginationAction', { detail: 'prev' }))}
              disabled={paginationData.currentPage === 1 || paginationData.loading}
              className="nav-pagination-btn"
              title="Previous page"
            >
              ←
            </button>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('paginationAction', { detail: 'next' }))}
              disabled={!paginationData.hasMore || paginationData.loading}
              className="nav-pagination-btn"
              title="Next page"
            >
              →
            </button>
          </div>
        )}
                                      <div className={`transition-all ${isReverseAnimating ? 'duration-[250ms]' : 'duration-[1500ms]'} ${
                 isRandomMusingsPage && !isReverseAnimating ? 'nav-fade-out' : 'nav-visible'
               }`}>
          <ThresholdControl />
        </div>
      </div>
    </nav>
  );
}