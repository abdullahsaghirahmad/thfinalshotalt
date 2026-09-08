/**
 * Add missing location parent tags on existing Cloudinary images.
 *
 *   node scripts/backfill-location-parents.js           # dry-run (default)
 *   node scripts/backfill-location-parents.js --apply    # write to Cloudinary
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const cloudinaryApi = require('../cloudinary-api');
const { loadParents, withLocationParents } = require('../tag-hierarchy');

const apply = process.argv.includes('--apply');
const parents = loadParents();

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
      images.push({
        public_id: img.public_id,
        tags: img.tags || []
      });
    });
    nextCursor = result.next_cursor || null;
  } while (nextCursor);
  return images;
}

async function main() {
  const cld = cloudinaryApi.cloudinary;
  if (!cld) {
    console.error('Cloudinary not configured (.env.local credentials required).');
    process.exit(1);
  }

  const images = await fetchAllImages(cld);
  const changes = [];

  images.forEach(function (img) {
    const expanded = withLocationParents(img.tags, parents);
    const missing = expanded.filter(function (t) { return img.tags.indexOf(t) === -1; });
    if (missing.length > 0) {
      changes.push({ public_id: img.public_id, add: missing, from: img.tags, to: expanded });
    }
  });

  console.log((apply ? 'APPLY' : 'DRY-RUN') + ': ' + images.length + ' images, ' + changes.length + ' need parent tags.');
  changes.forEach(function (c) {
    console.log('  ' + c.public_id + '  +' + c.add.join(','));
  });

  if (!apply) {
    console.log('\nRe-run with --apply to write these tags to Cloudinary.');
    return;
  }

  for (const c of changes) {
    await cld.uploader.add_tag(c.add.join(','), [c.public_id]);
    console.log('wrote ' + c.public_id);
  }
  console.log('Done. Run: node manifest-generator.js');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
