/**
 * Rename Cloudinary tags that contain spaces to the underscore form
 * the admin tagger already writes (e.g. "golden hour" → golden_hour).
 *
 *   node scripts/normalize-tag-underscores.js           # dry-run
 *   node scripts/normalize-tag-underscores.js --apply
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const cloudinaryApi = require('../cloudinary-api');

const apply = process.argv.includes('--apply');

function canonical(tag) {
  return String(tag || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeTagList(tags) {
  const next = [];
  const seen = new Set();
  let changed = false;
  (tags || []).forEach(function (t) {
    const c = /\s/.test(t) ? canonical(t) : t;
    if (c !== t) changed = true;
    if (!c || seen.has(c)) return;
    seen.add(c);
    next.push(c);
  });
  return { tags: next, changed: changed };
}

async function fetchAllImages(cld) {
  const images = [];
  let nextCursor = null;
  do {
    let q = cld.search
      .expression('resource_type:image AND NOT folder:about')
      .with_field('tags')
      .max_results(500);
    if (nextCursor) q = q.next_cursor(nextCursor);
    const result = await q.execute();
    (result.resources || []).forEach(function (img) {
      images.push({ public_id: img.public_id, tags: img.tags || [] });
    });
    nextCursor = result.next_cursor || null;
  } while (nextCursor);
  return images;
}

async function main() {
  const cld = cloudinaryApi.cloudinary;
  if (!cld) {
    console.error('Cloudinary not configured.');
    process.exit(1);
  }

  const images = await fetchAllImages(cld);
  const changes = [];
  const renameCounts = {};

  images.forEach(function (img) {
    const result = normalizeTagList(img.tags);
    if (!result.changed) return;
    img.tags.forEach(function (t) {
      if (/\s/.test(t)) {
        const c = canonical(t);
        renameCounts[t + ' → ' + c] = (renameCounts[t + ' → ' + c] || 0) + 1;
      }
    });
    changes.push({ public_id: img.public_id, from: img.tags, to: result.tags });
  });

  console.log((apply ? 'APPLY' : 'DRY-RUN') + ': ' + images.length + ' images, ' + changes.length + ' need tag rewrites.');
  Object.keys(renameCounts).sort().forEach(function (k) {
    console.log('  ' + k + '  (' + renameCounts[k] + ')');
  });
  changes.forEach(function (c) {
    console.log('  ' + c.public_id);
    console.log('    - ' + c.from.join(', '));
    console.log('    + ' + c.to.join(', '));
  });

  if (!apply) {
    console.log('\nRe-run with --apply to rewrite these tags on Cloudinary.');
    return;
  }

  for (const c of changes) {
    await cld.uploader.remove_all_tags([c.public_id]);
    if (c.to.length > 0) {
      await cld.uploader.add_tag(c.to.join(','), [c.public_id]);
    }
    console.log('wrote ' + c.public_id);
  }
  console.log('Done. Run: node manifest-generator.js');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
