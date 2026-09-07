const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;
app.use(express.json()); // needed for POST /admin/api/save-tags
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

// Discover page assets — explicit routes needed on Vercel serverless
// (express.static(__dirname) can miss root-level files in that context)
app.get('/discover.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'discover.js'));
});
app.get('/discover.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'discover.css'));
});

// API endpoint to fetch Cloudinary images
app.get('/api/cloudinary-images', async (req, res) => {
  try {
    const folder = req.query.folder || 'featured';
    const useManifest = req.query.manifest !== 'false'; // Default to using manifest
    
    // Add cache headers - cache for 1 hour
    res.set('Cache-Control', 'public, max-age=300, s-maxage=0');
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
    res.set('Cache-Control', 'public, max-age=300, s-maxage=0');
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
    res.set('Cache-Control', 'public, max-age=300, s-maxage=0');
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

// API: all images from the entire Cloudinary account (for the Discover carousel)
// Returns every image with its tags so discover.js can drive click-to-gallery by tag.
app.get('/api/all-images', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=300, s-maxage=0');
    res.set('Expires', new Date(Date.now() + 3600000).toUTCString());

    const cld = cloudinaryApi.cloudinary;
    if (!cld) {
      return res.json({ images: [], count: 0 });
    }

    const result = await cld.search
      .expression('resource_type:image AND NOT folder:about')
      .sort_by('created_at', 'desc')
      .with_field('tags')
      .max_results(200)
      .execute();

    // Return explicit fields including folder so the client knows the actual source
    res.json({
      images: (result.resources || []).map(r => ({
        public_id:  r.public_id,
        secure_url: r.secure_url,
        width:      r.width,
        height:     r.height,
        format:     r.format,
        tags:       r.tags || [],
        folder:     r.folder || r.asset_folder || ''
      })),
      count: result.total_count || 0
    });
  } catch (error) {
    console.error('Error fetching all images:', error);
    res.status(500).json({ error: 'Failed to fetch all images', message: error.message });
  }
});

// Serve the Discover page
app.get('/discover', (req, res) => {
  res.sendFile(path.join(__dirname, 'discover.html'));
});

// Load synonym map once at startup (shared with client via /tag-synonyms.json)
let tagSynonyms = {};
try {
  const rawSynonyms = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'public', 'tag-synonyms.json'), 'utf8'));
  delete rawSynonyms['_comment'];
  tagSynonyms = rawSynonyms;
  console.log(`Loaded ${Object.keys(tagSynonyms).length} tag synonyms`);
} catch(_) {}

function resolveTagSynonym(input) {
  const q  = (input || '').trim().toLowerCase();
  if (tagSynonyms[q]) return tagSynonyms[q];
  const q_ = q.replace(/\s+/g, '_');
  return tagSynonyms[q_] || q_;
}

// API: images with a specific Cloudinary tag — checks cached manifest first
app.get('/api/tag-images', async (req, res) => {
  const rawTag = req.query.tag;
  if (!rawTag) return res.status(400).json({ error: 'tag query parameter required' });

  // Support multi-tag: "dreamy,clouds" → Cloudinary AND query, bypass manifest
  const tagList = rawTag.split(',').map(t => resolveTagSynonym(t.trim())).filter(Boolean);
  const tag = tagList[0]; // single canonical tag for manifest lookup

  try {
    res.set('Cache-Control', 'public, max-age=300, s-maxage=0');

    const cld = cloudinaryApi.cloudinary;

    // Multi-tag: skip manifest, do live AND query
    if (tagList.length > 1) {
      if (!cld) return res.json({ tags: tagList, images: [], count: 0 });
      const expr = tagList.map(t => `tags=${t}`).join(' AND ') + ' AND resource_type:image';
      const result = await cld.search.expression(expr)
        .sort_by('created_at', 'desc').with_field('tags').max_results(100).execute();
      return res.json({
        tags: tagList,
        images: (result.resources || []).map(r => ({
          public_id: r.public_id, secure_url: r.secure_url,
          width: r.width, height: r.height, format: r.format,
          tags: r.tags || [], folder: r.folder || r.asset_folder || ''
        })),
        count: result.total_count || 0
      });
    }

    // Single tag: try cached manifest first
    const cached = await manifestGenerator.getTagManifest(tag);
    if (cached) {
      return res.json({ tag, images: cached.images || [], count: cached.count || 0 });
    }

    // Fallback: live Cloudinary query
    if (!cld) return res.json({ tag, images: [], count: 0 });

    const result = await cld.search
      .expression(`tags=${tag} AND resource_type:image`)
      .sort_by('created_at', 'desc')
      .with_field('tags')
      .max_results(100)
      .execute();

    res.json({
      images: (result.resources || []).map(function(r) {
        return {
          public_id: r.public_id, secure_url: r.secure_url,
          width: r.width, height: r.height, format: r.format,
          tags: r.tags || [], folder: r.folder || r.asset_folder || ''
        };
      }),
      count: result.total_count || 0
    });
  } catch (error) {
    console.error(`Error fetching tag images for "${tag}":`, error);
    res.status(500).json({ error: 'Failed to fetch tag images', message: error.message });
  }
});

// API: all unique tags in the Cloudinary account (for search autocomplete)
app.get('/api/available-tags', async (req, res) => {
  try {
    // Tag counts come from the tag manifests already on disk (generated at deploy time).
    // Zero Cloudinary API calls — just fast disk reads.
    // Counts stay fresh because vercel-build regenerates manifests on every deploy.
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // 1 hour CDN cache
    const fs = require('fs');
    const manifestDir = path.join(__dirname, 'public', 'manifests');
    const counts = {};

    try {
      fs.readdirSync(manifestDir)
        .filter(f => f.startsWith('tag-') && f.endsWith('.json'))
        .forEach(file => {
          try {
            const m = JSON.parse(fs.readFileSync(path.join(manifestDir, file), 'utf8'));
            if (m.tag && m.count) counts[m.tag] = m.count;
          } catch(_) {}
        });
    } catch(_) {}

    // Sort by image count descending — most represented tags first
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    if (sorted.length > 0) {
      return res.json({ tags: sorted, featured: sorted.slice(0, 12) });
    }

    // Fallback if manifests not yet generated: fast tag-names-only call
    const cld = cloudinaryApi.cloudinary;
    if (!cld) return res.json({ tags: [] });
    const result = await cld.api.tags({ max_results: 500 });
    res.json({ tags: result.tags || [], featured: (result.tags || []).slice(0, 12) });

  } catch (error) {
    console.error('Error fetching available tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags', message: error.message });
  }
});

// ── Admin tagger — LOCAL ONLY, never on Vercel ────────────────────────
// Must be registered BEFORE the catch-all below.
// Available at http://localhost:3001/admin/tagger
if (!process.env.VERCEL) {
  const taggerRoutes = require('./admin/tagger-routes');
  app.use('/admin', taggerRoutes);
}

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