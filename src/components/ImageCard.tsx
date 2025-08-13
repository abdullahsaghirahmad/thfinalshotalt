import Image from 'next/image';
import { Image as ImageType } from '@/lib/supabase';
import { useGalleryStore } from '@/store/store';

interface ImageCardProps {
  image: ImageType;
  isActive: boolean;
  onClick: () => void;
}

export function ImageCard({ image, isActive, onClick }: ImageCardProps) {
  const { threshold } = useGalleryStore();
  
  return (
    <div
      className={`relative aspect-square overflow-hidden cursor-pointer transition-opacity ${
        isActive ? 'opacity-100' : 'opacity-40'
      }`}
      onClick={onClick}
    >
      <Image
        src={`${image.path}?tr=th-${threshold}`}
        alt="Gallery image"
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        className="object-cover transition-all duration-300"
        priority={isActive}
      />
    </div>
  );
}
