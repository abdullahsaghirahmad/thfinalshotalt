import { ImageGrid } from '@/components/ImageGrid';
import { getImages } from '@/lib/supabase';

export const revalidate = 3600; // Revalidate every hour

export default async function DigitalPage() {
  const images = await getImages('digital');

  return (
    <main className="min-h-screen bg-white">
      <ImageGrid images={images} />
    </main>
  );
}
