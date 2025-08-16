import { NextRequest, NextResponse } from 'next/server';

// Cache responses for 1 hour
export const revalidate = 3600;

export async function GET(request: NextRequest) {
  try {
    // Get folder from URL params
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder') || 'featured';
    
    console.log(`API route: Fetching Cloudinary images for folder: ${folder}`);

    // Use the server.js API as a proxy to Cloudinary
    // This avoids exposing Cloudinary credentials in the client
    const apiUrl = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/cloudinary-images?folder=${folder}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch images: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Return the data with appropriate cache headers
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error in cloudinary-images API route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images' },
      { status: 500 }
    );
  }
}
