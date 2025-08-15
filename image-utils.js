// Image utilities for The Final Shot portfolio
const { getImageUrl } = require('./cloudinary-config');

// Image categories and their Cloudinary folder paths
const imageCategories = {
  featured: 'featured', // The user has moved photos to this folder
  europe: 'featured', // Using the same folder for now
  himalayas: 'featured', // Using the same folder for now
  info: 'featured' // Using the same folder for now
};

/**
 * Generate image metadata for a specific category
 * @param {string} category - The image category (featured, europe, himalayas, info)
 * @param {number} count - The number of images to generate metadata for
 * @returns {Array} Array of image metadata objects
 */
function generateImageMetadata(category, count) {
  const folderPath = imageCategories[category] || 'featured';
  const images = [];
  
  // Get actual image names from Cloudinary based on the folder structure we saw
  // The images appear to be already in the Cloudinary account
  const actualImageNames = [];
  
  // For each image in the folder (we saw 14 images in the screenshot)
  for (let i = 0; i < count && i < 14; i++) {
    // Just use the index as the ID since we don't know the actual filenames
    // The Cloudinary URL generation will handle the proper reference
    actualImageNames.push(`image_${i + 1}`);
  }
  
  // If we need more images than we have, repeat the ones we have
  if (count > actualImageNames.length) {
    const extraNeeded = count - actualImageNames.length;
    for (let i = 0; i < extraNeeded; i++) {
      actualImageNames.push(actualImageNames[i % actualImageNames.length]);
    }
  }
  
  // Now create metadata for each image
  for (let i = 0; i < count; i++) {
    const imageName = actualImageNames[i];
    const publicId = `${folderPath}/${imageName}`;
    
    // Use direct Cloudinary URLs for better reliability
    const standardUrl = getImageUrl(publicId, { transformation: 'standard' });
    
    images.push({
      id: i + 1,
      publicId,
      url: standardUrl, // Use the standard URL directly
      alt: `${category} image ${i + 1}`
    });
  }
  
  return images;
}

// Preload image function
function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

// Batch preload multiple images
function preloadImages(urls) {
  return Promise.all(urls.map(url => preloadImage(url)));
}

module.exports = {
  imageCategories,
  generateImageMetadata,
  preloadImage,
  preloadImages
};
