import { create } from 'zustand';
import { Image } from '@/lib/supabase';

interface GalleryState {
  currentSection: 'featured' | 'bnw' | 'about' | 'info';
  threshold: number;
  currentImageIndex: number;
  images: Image[];
  setCurrentSection: (section: 'featured' | 'bnw' | 'about' | 'info') => void;
  setThreshold: (threshold: number) => void;
  setCurrentImageIndex: (index: number) => void;
  setImages: (images: Image[]) => void;
}

export const useGalleryStore = create<GalleryState>((set) => ({
  currentSection: 'featured',
  threshold: 80,
  currentImageIndex: 0,
  images: [],
  setCurrentSection: (section) => set({ currentSection: section }),
  setThreshold: (threshold) => set({ threshold }),
  setCurrentImageIndex: (index) => set({ currentImageIndex: index }),
  setImages: (images) => set({ images }),
}));