// Manifest Generator for Cloudinary Images
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const cloudinary = require('./cloudinary-api');

// Directory where manifests will be stored
const MANIFEST_DIR = path.join(__dirname, 'public', 'manifests');
// Ensure the directory exists
if (!fs.existsSync(MANIFEST_DIR)) {
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
}

// List of categories to generate manifests for
const categories = ['featured', 'bnw', 'about', 'info'];

// How often to regenerate the manifest (in ms) - 1 hour by default
const CACHE_DURATION = process.env.MANIFEST_CACHE_DURATION || 3600000;

// Function to generate a manifest for a single category
async function generateManifestForCategory(category) {
  console.log(`Generating manifest for ${category}...`);
  
  try {
    // Fetch images from Cloudinary
    const result = await cloudinary.listImagesInFolder(category);
    
    if (!result.resources || result.resources.length === 0) {
      console.warn(`No images found for ${category}`);
      return null;
    }
    
    // Transform the data to a lighter format with just what we need
    const manifest = {
      category,
      updated_at: new Date().toISOString(),
      count: result.resources.length,
      images: result.resources.map((resource, index) => ({
        id: index + 1,
        public_id: resource.public_id,
        secure_url: resource.secure_url,
        width: resource.width,
        height: resource.height,
        format: resource.format
      }))
    };
    
    // Save the manifest to disk
    const manifestPath = path.join(MANIFEST_DIR, `${category}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
    console.log(`✅ Manifest for ${category} saved with ${manifest.count} images`);
    return manifest;
  } catch (error) {
    console.error(`❌ Error generating manifest for ${category}:`, error);
    return null;
  }
}

// Generate manifests for all categories
async function generateAllManifests() {
  console.log('Generating manifests for all categories...');
  
  const results = {};
  for (const category of categories) {
    results[category] = await generateManifestForCategory(category);
  }
  
  // Also create an index of all manifests
  const index = {
    updated_at: new Date().toISOString(),
    categories: Object.keys(results).filter(cat => results[cat] !== null).map(cat => ({
      name: cat,
      count: results[cat]?.count || 0,
      path: `/manifests/${cat}.json`
    }))
  };
  
  fs.writeFileSync(path.join(MANIFEST_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log('✅ All manifests generated successfully');
  
  return results;
}

// Function to check if manifest is stale
function isManifestStale(category) {
  const manifestPath = path.join(MANIFEST_DIR, `${category}.json`);
  
  // If file doesn't exist, it's stale
  if (!fs.existsSync(manifestPath)) {
    return true;
  }
  
  try {
    // Check last modified time
    const stats = fs.statSync(manifestPath);
    const lastModified = new Date(stats.mtime);
    const now = new Date();
    
    // If it's older than cache duration, it's stale
    return (now.getTime() - lastModified.getTime()) > CACHE_DURATION;
  } catch (error) {
    console.error('Error checking manifest staleness:', error);
    return true; // If there's an error, assume it's stale
  }
}

// Function to get the manifest for a category (generates if needed)
async function getManifest(category) {
  if (isManifestStale(category)) {
    console.log(`Manifest for ${category} is stale, regenerating...`);
    return await generateManifestForCategory(category);
  }
  
  // Read from the file
  try {
    const manifestPath = path.join(MANIFEST_DIR, `${category}.json`);
    const data = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading manifest for ${category}:`, error);
    // If there's an error reading, try to regenerate
    return await generateManifestForCategory(category);
  }
}

// Schedule regular regeneration
function scheduleRegenerateManifests() {
  // Do an initial generation
  generateAllManifests();
  
  // Schedule regeneration based on cache duration
  setInterval(() => {
    console.log('Scheduled manifest regeneration starting...');
    generateAllManifests();
  }, CACHE_DURATION);
}

module.exports = {
  generateManifestForCategory,
  generateAllManifests,
  getManifest,
  scheduleRegenerateManifests,
  categories
};

// If this file is run directly, generate all manifests
if (require.main === module) {
  generateAllManifests().then(() => {
    console.log('Manifest generation complete.');
    // Exit process when running in build environment (like Vercel)
    if (process.env.VERCEL) {
      console.log('Running in Vercel build environment, exiting process');
      process.exit(0);
    }
  }).catch(err => {
    console.error('Error generating manifests:', err);
    if (process.env.VERCEL) {
      process.exit(1);
    }
  });
}
