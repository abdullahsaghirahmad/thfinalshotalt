/**
 * admin/tagger-routes.js — Local-only admin tagger routes
 *
 * Registered in server.js ONLY when !process.env.VERCEL
 * → http://localhost:3001/admin/tagger
 */
'use strict';

const express = require('express');
const path    = require('path');
const router  = express.Router();
const cloudinaryApi = require('../cloudinary-api');
const { loadParents, saveParentLinks, addWhereTags } = require('../tag-hierarchy');
const { lookupPlace } = require('./place-lookup');

/* ── Serve the tagger HTML page ──────────────────────────────── */
router.get('/tagger', (req, res) => {
  res.sendFile(path.join(__dirname, 'tagger.html'));
});

/* ── GET /admin/api/taxonomy
   Serves tag-taxonomy.json from public/ so the frontend can group the vocabulary */
router.get('/api/taxonomy', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tag-taxonomy.json'));
});

router.get('/api/hierarchy', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tag-hierarchy.json'));
});

/* ── GET /admin/api/place-lookup?q=belgium
   File first, then Rest Countries, then Nominatim.              */
router.get('/api/place-lookup', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ found: false, parents: [], chain: [], links: [] });
  try {
    const result = await lookupPlace(q, loadParents());
    res.json(result);
  } catch (err) {
    console.error('[admin/place-lookup]', err.message);
    res.json({ found: false, tag: q, parents: [], chain: [], links: [], error: err.message });
  }
});

/* ── POST /admin/api/place-accept
   Persist hierarchy links + put tags in the Where group.
   Body: { tag, parents, links, ignore?: true }                   */
router.post('/api/place-accept', (req, res) => {
  try {
    const body = req.body || {};
    const tag = (body.tag || '').trim();
    const links = Array.isArray(body.links) ? body.links : [];
    const parents = Array.isArray(body.parents) ? body.parents : [];
    const ignore = !!body.ignore;

    const whereTags = [tag].concat(ignore ? [] : parents);
    if (!ignore && links.length) saveParentLinks(links);
    const tax = addWhereTags(whereTags.filter(Boolean));

    res.json({
      success: true,
      hierarchy: loadParents(),
      taxonomy: tax
    });
  } catch (err) {
    console.error('[admin/place-accept]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /admin/api/images
   Returns all images (optionally filtered) with their tags.
   ?filter=all | few (< 4 tags) | none (0 tags)               */
router.get('/api/images', async (req, res) => {
  try {
    const cld = cloudinaryApi.cloudinary;
    if (!cld) return res.status(500).json({ error: 'Cloudinary not configured' });

    const filter = req.query.filter || 'few';

    const result = await cld.search
      .expression('resource_type:image AND NOT folder:about')
      .sort_by('created_at', 'desc')
      .with_field('tags')
      .max_results(500)
      .execute();

    let images = (result.resources || []).map(img => ({
      public_id:  img.public_id,
      secure_url: img.secure_url,
      width:      img.width,
      height:     img.height,
      folder:     img.folder || img.asset_folder || '',
      tags:       img.tags || [],
      created_at: img.created_at
    }));

    if (filter === 'none') {
      images = images.filter(img => img.tags.length === 0);
    } else if (filter === 'few') {
      images = images.filter(img => img.tags.length < 4);
    }

    res.json({ total: result.total_count || images.length, filtered: images.length, images });
  } catch (err) {
    console.error('[admin/images]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /admin/api/vocabulary
   Counts every tag across the whole library so the UI can show
   frequency hints (e.g. "india · 14").                        */
router.get('/api/vocabulary', async (req, res) => {
  try {
    const cld = cloudinaryApi.cloudinary;
    if (!cld) return res.status(500).json({ error: 'Cloudinary not configured' });

    const result = await cld.search
      .expression('resource_type:image AND NOT folder:about')
      .with_field('tags')
      .max_results(500)
      .execute();

    const counts = {};
    (result.resources || []).forEach(img => {
      (img.tags || []).forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    const tags = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));

    res.json({ tags });
  } catch (err) {
    console.error('[admin/vocabulary]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /admin/api/save-tags
   Body: { public_id, tags: ['india','kashmir',...] }
   Replaces ALL tags on the image with the supplied array.     */
router.post('/api/save-tags', async (req, res) => {
  try {
    const { public_id, tags } = req.body;
    if (!public_id) return res.status(400).json({ error: 'public_id required' });

    const cld = cloudinaryApi.cloudinary;
    if (!cld) return res.status(500).json({ error: 'Cloudinary not configured' });

    const submitted = Array.isArray(tags) ? tags.filter(Boolean) : [];
    const finalTags = [...new Set(submitted)];

    // Remove all existing tags, then add the new set
    await cld.uploader.remove_all_tags([public_id]);
    if (finalTags.length > 0) {
      await cld.uploader.add_tag(finalTags.join(','), [public_id]);
    }

    console.log(`[tagger] saved ${finalTags.length} tags on ${public_id}:`, finalTags);
    res.json({ success: true, public_id, tags: finalTags });
  } catch (err) {
    console.error('[admin/save-tags]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
