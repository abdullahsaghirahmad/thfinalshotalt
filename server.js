const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;
const cloudinaryApi = require('./cloudinary-api');
const manifestGenerator = require('./manifest-generator');

// Serve static files with caching
app.use(express.static(__dirname, {
  maxAge: '1h', // Cache static assets for 1 hour
  setHeaders: (res, path) => {
    // Add cache headers for images
    if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png') || path.endsWith('.gif')) {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours for images
      res.setHeader('Expires', new Date(Date.now() + 86400000).toUTCString());
    }
  }
}));

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
    
    // Set cache headers
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Expires', new Date(Date.now() + 3600000).toUTCString());
    
    const manifest = await manifestGenerator.getManifest(category);
    if (manifest) {
      res.json(manifest);
    } else {
      res.status(404).json({ error: `Manifest for ${category} not found` });
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
    res.sendFile(path.join(__dirname, 'public', 'manifests', 'index.json'));
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