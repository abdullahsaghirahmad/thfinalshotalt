const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;
const cloudinaryApi = require('./cloudinary-api');

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
    
    // Add cache headers - cache for 1 hour
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Expires', new Date(Date.now() + 3600000).toUTCString());
    
    // Check if we have a cached version using ETag
    const etag = req.headers['if-none-match'];
    if (etag && etag === `W/"${folder}-cache"`) {
      // Return 304 Not Modified if the client has a cached version
      return res.status(304).end();
    }
    
    const result = await cloudinaryApi.listImagesInFolder(folder);
    
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

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
