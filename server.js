const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;
const cloudinaryApi = require('./cloudinary-api');
const manifestGenerator = require('./manifest-generator');
const { Client } = require('@notionhq/client');

// Load environment variables
require('dotenv').config();

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

// In-memory cache for Notion API responses
const notionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(databaseId, pageSize, cursor) {
  return `${databaseId}_${pageSize}_${cursor || 'first'}`;
}

function isCacheValid(cacheEntry) {
  return cacheEntry && Date.now() < cacheEntry.expires;
}

// Clean up expired cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of notionCache.entries()) {
    if (now >= entry.expires) {
      notionCache.delete(key);
      console.log('🧹 Cleaned up expired cache entry:', key);
    }
  }
}, 10 * 60 * 1000);

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

app.get('/scroll-utils.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scroll-utils.js'));
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

// Create a dedicated route for the random musings page
app.get('/random-musings', (req, res) => {
  res.sendFile(path.join(__dirname, 'random-musings.html'));
});

// Cache status endpoint for monitoring
app.get('/api/cache-status', (req, res) => {
  const cacheStats = {
    totalEntries: notionCache.size,
    entries: Array.from(notionCache.entries()).map(([key, entry]) => ({
      key,
      expiresIn: Math.max(0, entry.expires - Date.now()),
      isExpired: Date.now() >= entry.expires
    }))
  };
  res.json(cacheStats);
});

// API endpoint for Random Musings from Notion
app.get('/api/notion-musings', async (req, res) => {
  try {
    const databaseId = '041edb6d8d7f4af5b01cda8a2710d951';
    
    // Get pagination parameters
    const pageSize = parseInt(req.query.pageSize || '6');
    const startCursor = req.query.cursor;
    
    // Check cache first
    const cacheKey = getCacheKey(databaseId, pageSize, startCursor);
    const cached = notionCache.get(cacheKey);
    
    if (isCacheValid(cached)) {
      console.log('🚀 Serving cached response for:', cacheKey);
      res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
      res.set('Expires', new Date(Date.now() + 300000).toUTCString());
      return res.json(cached.data);
    }
    
    console.log('⏳ Cache miss - fetching fresh data for:', cacheKey);
    
    // Add cache headers
    res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    res.set('Expires', new Date(Date.now() + 300000).toUTCString());
    
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: 'Status',
        select: {
          equals: 'Random Musings'
        }
      },
      sorts: [
        {
          property: 'Date',
          direction: 'descending'
        }
      ],
      page_size: pageSize,
      ...(startCursor && { start_cursor: startCursor })
    });

    console.log(`🚀 Starting parallel content fetch for ${response.results.length} musings`);
    const startTime = Date.now();
    
    const musings = await Promise.all(response.results.map(async (page) => {
      const titleProp = page.properties.Name;
      const title = titleProp?.title?.[0]?.text?.content || 'Untitled';
      
      // Fetch page content blocks (these run in parallel)
      let blocks = [];
      try {
        const blocksResponse = await notion.blocks.children.list({
          block_id: page.id,
        });
        blocks = blocksResponse.results;
      } catch (error) {
        console.error('Error fetching page content for', page.id, ':', error);
      }
      
      // Extract text content and images from blocks
      let content = '';
      const images = [];
      
      blocks.forEach((block) => {
        if (block.type === 'paragraph' && block.paragraph?.rich_text) {
          const text = block.paragraph.rich_text.map((rt) => rt.plain_text).join('');
          if (text.trim()) content += text + '\n';
        } else if (block.type === 'heading_1' && block.heading_1?.rich_text) {
          const text = block.heading_1.rich_text.map((rt) => rt.plain_text).join('');
          if (text.trim()) content += text + '\n';
        } else if (block.type === 'heading_2' && block.heading_2?.rich_text) {
          const text = block.heading_2.rich_text.map((rt) => rt.plain_text).join('');
          if (text.trim()) content += text + '\n';
        } else if (block.type === 'heading_3' && block.heading_3?.rich_text) {
          const text = block.heading_3.rich_text.map((rt) => rt.plain_text).join('');
          if (text.trim()) content += text + '\n';
        } else if (block.type === 'bulleted_list_item' && block.bulleted_list_item?.rich_text) {
          const text = block.bulleted_list_item.rich_text.map((rt) => rt.plain_text).join('');
          if (text.trim()) content += '• ' + text + '\n';
        } else if (block.type === 'numbered_list_item' && block.numbered_list_item?.rich_text) {
          const text = block.numbered_list_item.rich_text.map((rt) => rt.plain_text).join('');
          if (text.trim()) content += '1. ' + text + '\n';
        } else if (block.type === 'image') {
          const imageUrl = block.image?.file?.url || block.image?.external?.url;
          if (imageUrl) images.push(imageUrl);
        }
      });
      
      return {
        id: page.id,
        title,
        status: page.properties.Status?.select?.name || '',
        content: content.trim(),
        blocks,
        images,
        date: page.properties.Date?.date?.start || page.created_time.split('T')[0],
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        url: page.url
      };
    }));
    
    console.log(`✅ Parallel content fetch completed in ${Date.now() - startTime}ms`);

    const responseData = {
      musings,
      hasMore: response.has_more,
      nextCursor: response.next_cursor,
      total: response.results.length
    };
    
    // Cache the response for 5 minutes
    notionCache.set(cacheKey, {
      data: responseData,
      expires: Date.now() + CACHE_TTL
    });
    
    console.log('💾 Cached fresh response for:', cacheKey);
    
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching Random Musings from Notion:', error);
    res.status(500).json({ 
      error: 'Failed to fetch musings', 
      message: error.message 
    });
  }
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