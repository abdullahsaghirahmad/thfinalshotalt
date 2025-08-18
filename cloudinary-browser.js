// Cloudinary configuration for browser
// This replaces the Node.js version with a browser-compatible one

// Cloudinary configuration - replace with your actual values
const cloudConfig = {
  cloudName: 'dess344fq', // Your cloud name
  secure: true
};

// Initialize Cloudinary
const cld = window.cloudinary || {};

// Image transformation options for different use cases
const transformations = {
  thumbnail: {
    width: 200,
    height: 200,
    crop: 'fill',
    quality: 'auto',
    format: 'auto'
  },
  standard: {
    width: 800, 
    height: 600,
    crop: 'limit',
    quality: 'auto',
    format: 'auto'
  },
  large: {
    width: 1600,
    height: 1200,
    crop: 'limit',
    quality: 'auto',
    format: 'auto'
  }
};

// Helper function to generate optimized image URLs
function generateCloudinaryUrl(publicId, options = {}) {
  const transformation = options.transformation || 'standard';
  const transformOpts = transformations[transformation];
  
  // Create the Cloudinary URL manually
  let url = `https://res.cloudinary.com/${cloudConfig.cloudName}/image/upload`;
  
  // Add transformations
  if (transformOpts) {
    url += `/w_${transformOpts.width},h_${transformOpts.height},c_${transformOpts.crop},q_auto,f_auto`;
  }
  
  // Add the public ID
  url += `/${publicId}`;
  
  return url;
}

// Image categories and their Cloudinary folder paths
const imageFolders = {
  featured: 'featured',
  bnw: 'bnw',
  about: 'about',
  info: 'info'
};

// Cache of loaded images by category
const imageCache = {
  featured: [],
  bnw: [],
  about: [],
  info: []
};

// Flag to track if we're currently loading images for a category
const isLoading = {
  featured: false,
  bnw: false,
  about: false,
  info: false
};

// Keep track of pending requests to avoid duplicates
const pendingRequests = {};

// Keep track of event listeners to avoid duplicates
let eventListenersRegistered = false;

// Fetch images directly from the server API - using manifest for faster loading
async function fetchImagesForCategory(category) {
  // Check if we have a pending request for this category
  if (pendingRequests[category]) {
    console.log(`Request already pending for ${category}, reusing promise`);
    return pendingRequests[category];
  }
  
  // Don't fetch if already loading
  if (isLoading[category]) {
    console.log(`Already fetching images for ${category}, waiting...`);
    return imageCache[category] || [];
  }
  
  // Use cache if available
  if (imageCache[category] && imageCache[category].length > 0) {
    console.log(`Using ${imageCache[category].length} cached images for ${category}`);
    return imageCache[category];
  }
  
  try {
    // Mark as loading
    isLoading[category] = true;
    
    // Create a promise for this request and store it
    pendingRequests[category] = (async () => {
      console.log(`Fetching images for category: ${category}`);
      
      // First try to fetch from manifest (much faster)
      try {
        console.log(`Trying manifest first for ${category}...`);
        const manifestResponse = await fetch(`/api/manifests/${category}`);
        
        if (manifestResponse.ok) {
          const manifest = await manifestResponse.json();
          console.log(`✅ Using manifest for ${category} with ${manifest.count} images`);
          
          // Convert manifest format to match the expected structure
          return {
            resources: manifest.images,
            total_count: manifest.count
          };
        }
      } catch (manifestError) {
        console.warn(`Manifest not available for ${category}, falling back to API: ${manifestError.message}`);
        // Continue to fallback method
      }
      
      // Fallback to regular API if manifest isn't available
      console.log(`Falling back to API for ${category}`);
      const response = await fetch(`/api/cloudinary-images?folder=${category}&manifest=false`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch images: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Clear the pending request when done
      delete pendingRequests[category];
      
      return result;
    })();
    
    // Wait for the promise to resolve
    const result = await pendingRequests[category];
    
    if (result.resources && result.resources.length > 0) {
      // Transform directly to our format - minimal processing
      const fetchedImages = result.resources.map((resource, index) => ({
        id: index + 1,
        publicId: resource.public_id,
        url: resource.secure_url || `https://res.cloudinary.com/${cloudConfig.cloudName}/image/upload/${resource.public_id}`,
        alt: `${category} image ${index + 1}`
      }));
      
      // Store in category cache
      imageCache[category] = fetchedImages;
      console.log(`Loaded ${fetchedImages.length} images for ${category}`);
      
      // Done loading
      isLoading[category] = false;
      return fetchedImages;
    } else {
      // This should never happen now with our guaranteed images in the API
      console.warn(`No images found for category: ${category}, using fallback`);
      
      // Create fallback images using the same pattern as the API
      const fallbackImages = [
        {
          id: 1,
          publicId: 'abdullah-ahmad-SLBjcE5IQxo-unsplash_xb4ash',
          url: `https://res.cloudinary.com/${cloudConfig.cloudName}/image/upload/v1755175923/abdullah-ahmad-SLBjcE5IQxo-unsplash_xb4ash.jpg`,
          alt: `${category} image 1`
        },
        {
          id: 2,
          publicId: 'abdullah-ahmad-V5Osd0LKiLQ-unsplash_ugngol',
          url: `https://res.cloudinary.com/${cloudConfig.cloudName}/image/upload/v1755175923/abdullah-ahmad-V5Osd0LKiLQ-unsplash_ugngol.jpg`,
          alt: `${category} image 2`
        }
      ];
      
      // Duplicate to match expected count
      const images = [];
      for (let i = 0; i < 14; i++) {
        images.push({...fallbackImages[i % fallbackImages.length], id: i + 1});
      }
      
      // Store in cache
      imageCache[category] = images;
      console.log(`Using ${images.length} fallback images for ${category}`);
      
      isLoading[category] = false;
      return images;
    }
  } catch (error) {
    console.error(`Error fetching images for ${category}:`, error);
    isLoading[category] = false;
    
    // Return empty array - the script.js will handle this
    return [];
  }
}

// Main function to get images for a category - returns Promise
async function getImagesForCategory(category, count) {
  let images = [];
  
  // First check cache
  if (imageCache[category] && imageCache[category].length > 0) {
    images = imageCache[category];
    console.log(`Using ${images.length} cached images for ${category}`);
    
    // If we're requesting more images than we have cached, fetch more in the background
    if (count > images.length && !pendingRequests[category]) {
      console.log(`Cache has ${images.length} images but ${count} requested, fetching more in background`);
      fetchImagesForCategory(category).then(newImages => {
        console.log(`Background fetch complete, got ${newImages.length} images`);
      });
    }
  } else {
    // Fetch new images - but limit to 10 for immediate display if this is the first fetch
    const initialFetchCount = count <= 10 ? count : 10;
    
    try {
      images = await fetchImagesForCategory(category);
      
      // If we got fewer than requested, and this is just the initial batch,
      // trigger a background fetch for the rest
      if (images.length < count && initialFetchCount < count) {
        console.log(`Initial fetch returned ${images.length} images, fetching more in background`);
        setTimeout(() => {
          fetchImagesForCategory(category).then(moreImages => {
            console.log(`Background fetch complete, got ${moreImages.length} total images`);
          });
        }, 100);
      }
    } catch (error) {
      console.error(`Error fetching images for ${category}:`, error);
      images = [];
    }
  }
  
  // Return requested number, cycling if needed
  if (images.length === 0) {
    console.error(`No images available for ${category}`);
    return [];
  }
  
  // If count is 0 or not specified, return all available images
  if (!count) {
    return images.map((image, i) => ({...image, id: i + 1}));
  }
  
  // Otherwise, return the exact count requested, cycling through available images if needed
  const result = [];
  for (let i = 0; i < count; i++) {
    const index = i % images.length;
    result.push({...images[index], id: i + 1});
  }
  
  return result;
}

// Legacy function for backward compatibility - now uses the async version
// but returns immediately with cached results or empty array
function generateImageMetadata(category, count) {
  // If we have cached images, use them
  if (imageCache[category] && imageCache[category].length > 0) {
    // If count is 0 or not specified, return all available images
    if (!count) {
      return imageCache[category].map((image, i) => ({...image, id: i + 1}));
    }
    
    const images = [];
    for (let i = 0; i < count; i++) {
      const index = i % imageCache[category].length;
      images.push({...imageCache[category][index], id: i + 1});
    }
    return images;
  }
  
  // Start loading in background if not already loading
  if (!isLoading[category]) {
    getImagesForCategory(category, count).then(images => {
      // Images will be in cache after this completes
      console.log(`Background loaded ${images.length} images for ${category}`);
    });
  }
  
  // Return empty array - the script.js will need to handle this
  return [];
}

// Simple preloader function
function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function preloadImages(urls) {
  return Promise.all(urls.map(url => preloadImage(url)));
}

// We now have the correct image paths from the user,
// so we don't need the discovery function anymore.

// Simple function to check image loading
function verifyCloudinaryImages() {
  // Log successful loading of Cloudinary images
  console.log('Using actual artist images from Cloudinary');
  
  // Add error handling for Cloudinary images
  const allImages = document.querySelectorAll('img');
  allImages.forEach(img => {
    img.addEventListener('error', () => {
      console.error('Error loading image:', img.src);
    });
    
    img.addEventListener('load', () => {
      console.log('Successfully loaded image:', img.src);
    });
  });
}

// Initialize Cloudinary image loading
function initializeImageLoading() {
  // Only register once
  if (eventListenersRegistered) {
    console.log('Image loading already initialized, skipping');
    return;
  }
  
  console.log('Using Cloudinary for image delivery');
  
  // Get the active category from the UI
  const currentCategory = document.querySelector('.menu-item.active')?.dataset.category || 'featured';
  console.log(`Initial category: ${currentCategory}`);
  
  // Only load images for the current category - first 10 immediately
  getImagesForCategory(currentCategory, 10).then(images => {
    if (images && images.length > 0) {
      console.log(`Loaded first ${images.length} images for initial category: ${currentCategory}`);
      
      // Notify the app that images are ready
      const event = new CustomEvent('imagesLoaded', { 
        detail: { 
          category: currentCategory,
          count: images.length
        }
      });
      window.dispatchEvent(event);
      
      // Load remaining images in the background
      setTimeout(() => {
        console.log('Loading remaining images in background');
        getImagesForCategory(currentCategory, 40).then(allImages => {
          console.log(`Background loaded ${allImages.length} total images`);
        });
      }, 1000); // Delay background loading by 1 second
    }
  });
  
  // Mark as registered
  eventListenersRegistered = true;
}

// Register the initialization function on window load
window.addEventListener('load', initializeImageLoading);

// Make functions available globally
window.imageUtils = {
  generateImageMetadata,
  getImagesForCategory,
  fetchImagesForCategory,
  preloadImage,
  preloadImages,
  verifyCloudinaryImages
};
