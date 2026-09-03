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

// ── Tag manifest generation ───────────────────────────────────────────────
// Pre-generates a JSON manifest for each Cloudinary tag so /api/tag-images
// can be served from disk (instant) rather than hitting the Cloudinary API.

async function generateManifestForTag(tag) {
  console.log(`Generating manifest for tag: ${tag}...`);
  try {
    const cld = cloudinary.cloudinary;
    if (!cld) {
      console.warn(`Cloudinary not configured, skipping tag manifest: ${tag}`);
      return null;
    }
    const result = await cld.search
      .expression(`tags=${tag} AND resource_type:image`)
      .sort_by('created_at', 'desc')
      .with_field('tags')
      .max_results(200)
      .execute();

    if (!result.resources || result.resources.length === 0) {
      console.warn(`No images found for tag: ${tag}`);
      return null;
    }

    const manifest = {
      tag,
      updated_at: new Date().toISOString(),
      count: result.resources.length,
      images: result.resources.map((img, i) => ({
        id: i + 1,
        public_id: img.public_id,
        secure_url: img.secure_url,
        width: img.width,
        height: img.height,
        format: img.format,
        tags: img.tags || []
      }))
    };

    // Try to cache to disk — may fail on read-only runtimes (Vercel serverless).
    // Always return the manifest data regardless of whether the write succeeds.
    try {
      const filePath = path.join(MANIFEST_DIR, `tag-${tag.replace(/[^a-z0-9_-]/gi, '_')}.json`);
      fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
      console.log(`✅ Tag manifest saved: ${tag} (${manifest.count} images)`);
    } catch (writeErr) {
      console.warn(`⚠️  Could not write manifest for "${tag}" (read-only fs?): ${writeErr.message}`);
    }
    return manifest;
  } catch (err) {
    console.error(`❌ Error generating tag manifest for "${tag}":`, err.message);
    return null;
  }
}

async function getTagManifest(tag) {
  const safeName = tag.replace(/[^a-z0-9_-]/gi, '_');
  const filePath = path.join(MANIFEST_DIR, `tag-${safeName}.json`);
  // Check if cached file exists and is fresh
  if (fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath);
      const age = Date.now() - new Date(stats.mtime).getTime();
      if (age < CACHE_DURATION) {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (_) {}
  }
  // Not cached or stale — regenerate
  return await generateManifestForTag(tag);
}

async function generateAllTagManifests() {
  try {
    const cld = cloudinary.cloudinary;
    if (!cld) { console.warn('Cloudinary not configured, skipping tag manifests'); return; }
    const result = await cld.api.tags({ max_results: 500 });
    const tags = result.tags || [];
    console.log(`Generating manifests for ${tags.length} tags...`);
    for (const tag of tags) {
      await generateManifestForTag(tag);
    }
    console.log('✅ All tag manifests generated');
  } catch (err) {
    console.error('❌ Error generating tag manifests:', err.message);
  }
}

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
  generateAllManifests().then(() => {
    // After folder manifests are done, generate tag manifests in the background
    generateAllTagManifests().catch(err => console.error('Tag manifest error:', err));
  });

  // Schedule regeneration based on cache duration
  setInterval(() => {
    console.log('Scheduled manifest regeneration starting...');
    generateAllManifests().then(() => {
      generateAllTagManifests().catch(() => {});
    });
  }, CACHE_DURATION);
}

module.exports = {
  generateManifestForCategory,
  generateAllManifests,
  getManifest,
  scheduleRegenerateManifests,
  generateAllTagManifests,
  getTagManifest,
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
