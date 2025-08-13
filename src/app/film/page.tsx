import { ImageGrid } from '@/components/ImageGrid';
import { getImages } from '@/lib/supabase';

export const revalidate = 3600; // Revalidate every hour

export default async function FilmPage() {
  const images = await getImages('film');

  return (
    <main className="min-h-screen bg-white">
      <ImageGrid images={images} />
    </main>
  );
}
