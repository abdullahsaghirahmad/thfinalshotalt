# How to Add a New Category to The Final Shot

This guide provides step-by-step instructions for adding a new category/section to your portfolio website.

> **Important**: The website has two implementations:
> 1. A legacy implementation using vanilla JS (index.html, script.js)
> 2. A modern implementation using Next.js (src/app/*)
>
> You need to update both to ensure consistent behavior.

## Prerequisites

1. Make sure you have a folder with the same name as your category in your Cloudinary account
2. The images should be uploaded to this folder in Cloudinary

## Step 1: Create a New Page

Create a new file at `src/app/your-category-name/page.tsx` with this content:

```tsx
import { ImageGrid } from '@/components/ImageGrid';
import { getImages } from '@/lib/supabase';
import { getCloudinaryImages, mapToSupabaseFormat } from '@/lib/cloudinary';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

async function YourCategoryImages() {
  try {
    // First try to fetch from Cloudinary
    const cloudinaryImages = await getCloudinaryImages('your-category-name');
    if (cloudinaryImages && cloudinaryImages.length > 0) {
      // Map Cloudinary response to Supabase format for compatibility
      const images = mapToSupabaseFormat(cloudinaryImages);
      return <ImageGrid images={images} />;
    }
    
    // Fall back to Supabase if needed
    console.log('Falling back to Supabase for your category images');
    const images = await getImages('your-category-name');
    return <ImageGrid images={images} />;
  } catch (error) {
    console.error('Error loading your category images:', error);
    // Final fallback - empty array
    return <ImageGrid images={[]} />;
  }
}

export default function YourCategoryPage() {
  return (
    <main className="min-h-screen bg-white">
      <Suspense fallback={<div className="mt-16 p-4">Loading...</div>}>
        <YourCategoryImages />
      </Suspense>
    </main>
  );
}
```

Replace all instances of `your-category-name` with the name of your category (must match your Cloudinary folder name).
Replace `YourCategory` with the capitalized version of your category name.

## Step 2: Update Navigation

Edit `src/components/Navigation.tsx` to add your new category to the navigation menu:

```tsx
// Find this section in the file
const sections = [
  { name: 'Featured', path: '/' },
  { name: 'BnW', path: '/bnw' },
  // Add your new category here:
  { name: 'Your Category', path: '/your-category-name' },
  { name: 'Info', path: '/info' },
];
```

## Step 3: Update Gallery Store

Edit `src/store/store.ts` to add your new category to the state management:

```tsx
// Find this interface and add your category name
interface GalleryState {
  currentSection: 'featured' | 'bnw' | 'your-category-name' | 'info';
  threshold: number;
  currentImageIndex: number;
  images: Image[];
  setCurrentSection: (section: 'featured' | 'bnw' | 'your-category-name' | 'info') => void;
  setThreshold: (threshold: number) => void;
  setCurrentImageIndex: (index: number) => void;
  setImages: (images: Image[]) => void;
}
```

## Step 4: Update Cloudinary Configuration

Edit `cloudinary-browser.js` to add your new category to the configuration:

```js
// Find and update these objects
// Image categories and their Cloudinary folder paths
const imageFolders = {
  featured: 'featured',
  bnw: 'bnw',
  'your-category-name': 'your-category-name',
  info: 'info'
};

// Cache of loaded images by category
const imageCache = {
  featured: [],
  bnw: [],
  'your-category-name': [],
  info: []
};

// Flag to track if we're currently loading images for a category
const isLoading = {
  featured: false,
  bnw: false,
  'your-category-name': false,
  info: false
};
```

## Step 5: Add Images to Cloudinary

1. Login to your Cloudinary dashboard
2. Create a new folder with the same name as your category (if it doesn't exist)
3. Upload images to this folder

## Step 6: Update Legacy Implementation

You also need to update the vanilla JS implementation in `index.html`:

```html
<!-- Find the menu-items div in index.html and add your new category -->
<div class="menu-items">
    <div class="menu-item active" data-category="featured">Featured</div>
    <div class="menu-item" data-category="bnw">BnW</div>
    <div class="menu-item" data-category="your-category-name">Your Category</div>
    <div class="menu-item" data-category="info">
        <a href="/info" style="text-decoration: none; color: inherit;">Info</a>
    </div>
</div>
```

## Quick Command Reference

Here's a copy-paste friendly command to create a new category page:

```bash
mkdir -p src/app/your-category-name
```

Then copy and paste the page content from Step 1 to a new file at `src/app/your-category-name/page.tsx`.

## Testing Your Changes

1. Make sure you have images in the corresponding Cloudinary folder
2. Restart your Next.js application: `npm run dev`
3. Restart your Express server: `node server.js` (for the legacy implementation)
4. Navigate to your new category in the website

That's it! Your new category should now be visible in the navigation menu and display images from the corresponding Cloudinary folder.
