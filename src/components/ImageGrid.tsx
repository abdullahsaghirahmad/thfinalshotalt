import { useGalleryStore } from '@/store/store';
import { Image as ImageType } from '@/lib/supabase';
import { ImageCard } from './ImageCard';

interface ImageGridProps {
  images: ImageType[];
}

export function ImageGrid({ images }: ImageGridProps) {
  const { currentImageIndex, setCurrentImageIndex } = useGalleryStore();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 mt-16">
      {images.map((image, index) => (
        <ImageCard
          key={image.id}
          image={image}
          isActive={index === currentImageIndex}
          onClick={() => setCurrentImageIndex(index)}
        />
      ))}
    </div>
  );
}
