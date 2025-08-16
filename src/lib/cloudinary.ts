import { cache } from 'react';

// Cloudinary configuration
const CLOUD_NAME = 'dess344fq';
const API_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

export interface CloudinaryImage {
  id: string;
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  created_at: string;
  folder: string;
}

// Image transformations for different use cases
export const transformations = {
  thumbnail: 'w_400,h_400,c_fill,q_auto,f_auto',
  standard: 'w_800,h_600,c_limit,q_auto,f_auto', 
  large: 'w_1600,h_1200,c_limit,q_auto,f_auto',
};

// Function to generate Cloudinary URLs
export function buildCloudinaryUrl(
  publicId: string,
  transformation = transformations.standard
): string {
  return `${API_URL}/${transformation}/${publicId}`;
}

// Fetch images from Cloudinary via our server API
export const getCloudinaryImages = cache(async (folder: string): Promise<CloudinaryImage[]> => {
  try {
    const response = await fetch(`/api/cloudinary-images?folder=${folder}`, {
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Cloudinary images: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.resources || result.resources.length === 0) {
      console.warn(`No Cloudinary images found for folder: ${folder}`);
      return [];
    }

    return result.resources.map((resource: any): CloudinaryImage => ({
      id: resource.asset_id || resource.public_id,
      public_id: resource.public_id,
      secure_url: resource.secure_url,
      width: resource.width,
      height: resource.height,
      format: resource.format,
      created_at: resource.created_at,
      folder: resource.folder || folder
    }));
  } catch (error) {
    console.error('Error fetching Cloudinary images:', error);
    return [];
  }
});

// Convert Cloudinary images to Supabase format for compatibility
export function mapToSupabaseFormat(images: CloudinaryImage[]) {
  return images.map((image, index) => ({
    id: image.id,
    created_at: image.created_at,
    path: image.secure_url,
    section: image.folder,
    metadata: {
      width: image.width,
      height: image.height,
      size: 0, // Not available from Cloudinary
    }
  }));
}
