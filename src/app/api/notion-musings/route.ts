import { NextRequest, NextResponse } from 'next/server';
import { getRandomMusings } from '@/lib/notion';

// In-memory cache for Notion API responses
const notionCache = new Map<string, { data: any; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCacheKey(pageSize: number, cursor?: string): string {
  return `musings_${pageSize}_${cursor || 'first'}`
}

function isCacheValid(cacheEntry: { data: any; expires: number } | undefined): boolean {
  return Boolean(cacheEntry && Date.now() < cacheEntry.expires)
}

// Clean up expired cache entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of notionCache.entries()) {
    if (now >= entry.expires) {
      notionCache.delete(key)
      console.log('🧹 Cleaned up expired cache entry:', key)
    }
  }
}, 10 * 60 * 1000)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;
    const pageSize = parseInt(searchParams.get('pageSize') || '15');
    
    // Check cache first
    const cacheKey = getCacheKey(pageSize, cursor);
    const cached = notionCache.get(cacheKey);
    
    if (isCacheValid(cached)) {
      console.log('🚀 Serving cached response for:', cacheKey);
      return NextResponse.json(cached!.data, {
        headers: {
          'Cache-Control': 'public, max-age=300',
          'Expires': new Date(Date.now() + 300000).toUTCString(),
        }
      });
    }
    
    console.log('⏳ Cache miss - fetching fresh data for:', cacheKey);
    const response = await getRandomMusings(cursor, pageSize);
    
    // Cache the response for 5 minutes
    notionCache.set(cacheKey, {
      data: response,
      expires: Date.now() + CACHE_TTL
    });
    
    console.log('💾 Cached fresh response for:', cacheKey);
    
    // Add cache headers - cache for 5 minutes for dynamic content
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'Expires': new Date(Date.now() + 300000).toUTCString(),
      }
    });
  } catch (error) {
    console.error('Error fetching Random Musings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch musings', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
