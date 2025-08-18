import { ImageGrid } from '@/components/ImageGrid';
import { getImages } from '@/lib/supabase';
import { getCloudinaryImages, mapToSupabaseFormat } from '@/lib/cloudinary';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

async function AboutImages() {
  try {
    // First try to fetch from Cloudinary
    const cloudinaryImages = await getCloudinaryImages('about');
    if (cloudinaryImages && cloudinaryImages.length > 0) {
      // Map Cloudinary response to Supabase format for compatibility
      const images = mapToSupabaseFormat(cloudinaryImages);
      return <ImageGrid images={images} />;
    }
    
    // Fall back to Supabase if needed
    console.log('Falling back to Supabase for about images');
    const images = await getImages('about');
    return <ImageGrid images={images} />;
  } catch (error) {
    console.error('Error loading about images:', error);
    // Final fallback - empty array
    return <ImageGrid images={[]} />;
  }
}

function BioSection() {
  return (
    <div className="bio-section">
      <h1>Abdullah Ahmad</h1>
      <p>
        Abdullah is a self-taught storyteller from India who uses frames, films, and
        fiction to tell stories that deliver a feeling. His north star is to introduce
        people to hitherto unexperienced horizons of beauty. To inspire them to be
        more, to do more. To be the versions of themselves that they are low-key
        happy about on the inside.
      </p>
      <p>
        His work has been viewed millions of times on various social media platforms,
        magazines, online publications, film festivals, and on the cover of a book. He
        constantly works towards creating something that delivers a feeling.
      </p>
      <div className="contact-links">
        <a href="mailto:abdullahsaghirahmad@gmail.com" className="contact-link">Email ↗</a>
        <a href="https://instagram.com/th.final.shot" target="_blank" rel="noopener noreferrer" className="contact-link">Instagram ↗</a>
        <a href="https://youtube.com/abdullahsaghirahmad" target="_blank" rel="noopener noreferrer" className="contact-link">YouTube ↗</a>
        <a href="https://unsplash.com/@thefinalshot" target="_blank" rel="noopener noreferrer" className="contact-link">Unsplash ↗</a>
        <a href="https://thefinalshot.beehiiv.com/" target="_blank" rel="noopener noreferrer" className="contact-link">Newsletter ↗</a>
        <a href="https://linkedin.com/in/abdullahsaghirahmad" target="_blank" rel="noopener noreferrer" className="contact-link">LinkedIn ↗</a>
      </div>
      <div className="copyright">
        © 2025 The Final Shot. All rights reserved.
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="about-layout">
        <div className="section-a" id="section-a">
          <BioSection />
        </div>
        <div className="section-b" id="section-b">
          <Suspense fallback={<div>Loading...</div>}>
            <AboutImages />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
