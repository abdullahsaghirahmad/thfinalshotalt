'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThresholdControl } from './ThresholdControl';

export function Navigation() {
  const pathname = usePathname();
  const sections = [
    { name: 'Featured', path: '/' },
    { name: 'BnW', path: '/bnw' },
    { name: 'Info', path: '/info' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 p-4 flex items-center justify-between bg-white/80 backdrop-blur-sm z-50">
      <div className="flex items-center space-x-1">
        <Link 
          href="/" 
          className="hover:opacity-60 transition-opacity" /* Removed font-mono and text-sm to match menu items */
        >
          The Final Shot
        </Link>
        <div className="flex items-center space-x-1">
          {sections.map((section, index) => (
            <span key={section.path}>
              {index > 0 && <span className="text-neutral-400">,</span>}
              <Link
                href={section.path}
                className={`ml-1 hover:opacity-60 transition-opacity ${
                  pathname === section.path ? 'opacity-40' : ''
                }`}
              >
                {section.name}
              </Link>
            </span>
          ))}
        </div>
      </div>
      <ThresholdControl />
    </nav>
  );
}