import { ImageGrid } from '@/components/ImageGrid';
import { getImages } from '@/lib/supabase';
import { getCloudinaryImages, mapToSupabaseFormat } from '@/lib/cloudinary';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

async function BnWImages() {
  try {
    // First try to fetch from Cloudinary
    const cloudinaryImages = await getCloudinaryImages('bnw');
    if (cloudinaryImages && cloudinaryImages.length > 0) {
      // Map Cloudinary response to Supabase format for compatibility
      const images = mapToSupabaseFormat(cloudinaryImages);
      return <ImageGrid images={images} />;
    }
    
    // Fall back to Supabase if needed
    console.log('Falling back to Supabase for BnW images');
    const images = await getImages('bnw');
    return <ImageGrid images={images} />;
  } catch (error) {
    console.error('Error loading BnW images:', error);
    // Final fallback - empty array
    return <ImageGrid images={[]} />;
  }
}

export default function BnWPage() {
  return (
    <main className="min-h-screen bg-white">
      <Suspense fallback={<div className="mt-16 p-4">Loading...</div>}>
        <BnWImages />
      </Suspense>
    </main>
  );
}
