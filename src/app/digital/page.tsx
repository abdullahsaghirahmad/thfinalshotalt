import { ImageGrid } from '@/components/ImageGrid';
import { getImages } from '@/lib/supabase';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

async function DigitalImages() {
  const images = await getImages('digital');
  return <ImageGrid images={images} />;
}

export default function DigitalPage() {
  return (
    <main className="min-h-screen bg-white">
      <Suspense fallback={<div className="mt-16 p-4">Loading...</div>}>
        <DigitalImages />
      </Suspense>
    </main>
  );
}