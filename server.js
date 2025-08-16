const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;
const cloudinaryApi = require('./cloudinary-api');
const manifestGenerator = require('./manifest-generator');

// Log environment for debugging
console.log(`Running in ${process.env.VERCEL ? 'Vercel' : 'local'} environment`);
console.log(`Current directory: ${__dirname}`);

// Create appropriate static file middleware based on environment
// In Vercel, __dirname behaves differently than local development
const staticOptions = {
  maxAge: '1h', // Cache static assets for 1 hour
  setHeaders: (res, filePath) => {
    // Add cache headers for images
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.png') || filePath.endsWith('.gif')) {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours for images
      res.setHeader('Expires', new Date(Date.now() + 86400000).toUTCString());
    }
  }
};

// Serve static files with caching
app.use(express.static(__dirname, staticOptions));

// Explicitly serve key files in case of path issues
app.get('/script.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'script.js'));
});

app.get('/cloudinary-browser.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'cloudinary-browser.js'));
});

app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'styles.css'));
});

// API endpoint to fetch Cloudinary images
app.get('/api/cloudinary-images', async (req, res) => {
  try {
    const folder = req.query.folder || 'featured';
    const useManifest = req.query.manifest !== 'false'; // Default to using manifest
    
    // Add cache headers - cache for 1 hour
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Expires', new Date(Date.now() + 3600000).toUTCString());
    
    // Check if we have a cached version using ETag
    const etag = req.headers['if-none-match'];
    if (etag && etag === `W/"${folder}-cache"`) {
      // Return 304 Not Modified if the client has a cached version
      return res.status(304).end();
    }
    
    let result;
    
    // Try to use the manifest for faster response
    if (useManifest) {
      const manifest = await manifestGenerator.getManifest(folder);
      if (manifest) {
        // Convert manifest format to match Cloudinary API response
        result = {
          resources: manifest.images,
          total_count: manifest.count
        };
      } else {
        // Fall back to direct API call if manifest not available
        result = await cloudinaryApi.listImagesInFolder(folder);
      }
    } else {
      // Direct API call if manifest is disabled
      result = await cloudinaryApi.listImagesInFolder(folder);
    }
    
    // Set ETag for caching
    res.set('ETag', `W/"${folder}-cache"`);
    
    res.json(result);
  } catch (error) {
    console.error('Error in /api/cloudinary-images:', error);
    res.status(500).json({ error: 'Failed to fetch images', message: error.message });
  }
});

// Create a dedicated route for the info page
app.get('/info', (req, res) => {
  res.sendFile(path.join(__dirname, 'info.html'));
});

// API endpoint to directly access image manifests
app.get('/api/manifests/:category', async (req, res) => {
  try {
    const { category } = req.params;
    
    console.log(`Manifest request for category: ${category}`);
    
    // Set cache headers
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Expires', new Date(Date.now() + 3600000).toUTCString());
    
    // In Vercel, we might not have pre-generated manifests, so generate on-demand
    let manifest;
    try {
      // Try to get existing manifest
      manifest = await manifestGenerator.getManifest(category);
    } catch (err) {
      console.log(`No existing manifest for ${category}, generating new one`);
      // If manifest doesn't exist, generate a new one
      manifest = await manifestGenerator.generateManifestForCategory(category);
    }
    
    if (manifest) {
      console.log(`Serving manifest for ${category} with ${manifest.count || 0} images`);
      res.json(manifest);
    } else {
      console.log(`No manifest found or generated for ${category}`);
      // Generate fallback data if possible
      const result = await cloudinaryApi.listImagesInFolder(category);
      if (result && result.resources) {
        console.log(`Serving direct API results for ${category} with ${result.resources.length} images`);
        res.json({
          category,
          count: result.resources.length,
          images: result.resources
        });
      } else {
        res.status(404).json({ error: `Manifest for ${category} not found` });
      }
    }
  } catch (error) {
    console.error(`Error serving manifest: ${error}`);
    res.status(500).json({ error: 'Failed to serve manifest' });
  }
});

// API endpoint to list all available manifests
app.get('/api/manifests', (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=3600');
    const indexPath = path.join(__dirname, 'public', 'manifests', 'index.json');
    
    // Check if file exists first, if not generate categories dynamically
    if (require('fs').existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      console.log('No manifest index found, generating dynamic response');
      res.json({
        updated_at: new Date().toISOString(),
        categories: manifestGenerator.categories.map(cat => ({
          name: cat,
          path: `/manifests/${cat}.json`
        }))
      });
    }
  } catch (error) {
    console.error(`Error serving manifest index: ${error}`);
    res.status(500).json({ 
      error: 'Failed to serve manifest index',
      categories: manifestGenerator.categories
    });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  
  // Initialize manifest generator when server starts
  manifestGenerator.scheduleRegenerateManifests();
  console.log('Image manifest generator initialized');
});