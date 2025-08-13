import { ImageGrid } from '@/components/ImageGrid';
import { getImages } from '@/lib/supabase';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

async function FilmImages() {
  const images = await getImages('film');
  return <ImageGrid images={images} />;
}

export default function FilmPage() {
  return (
    <main className="min-h-screen bg-white">
      <Suspense fallback={<div className="mt-16 p-4">Loading...</div>}>
        <FilmImages />
      </Suspense>
    </main>
  );
}