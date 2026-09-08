/**
 * Replace Cloudinary tags on images (does not touch project:* tags).
 *
 *   node scripts/replace-cloudinary-tags.js --from=bnw,noir --to=monochrome
 *   node scripts/replace-cloudinary-tags.js --from=bnw,noir --to=monochrome --apply
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const cloudinaryApi = require('../cloudinary-api');

function arg(name, fallback) {
  const prefix = '--' + name + '=';
  const hit = process.argv.find(function (a) { return a.indexOf(prefix) === 0; });
  return hit ? hit.slice(prefix.length) : fallback;
}

const apply = process.argv.includes('--apply');
const fromList = (arg('from', '') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
const to = (arg('to', '') || '').trim();

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

function rewrite(tags) {
  const fromSet = new Set(fromList);
  const next = [];
  const seen = new Set();
  let changed = false;
  (tags || []).forEach(function (t) {
    let n = t;
    if (fromSet.has(t)) {
      n = to;
      changed = true;
    }
    if (!n || seen.has(n)) return;
    seen.add(n);
    next.push(n);
  });
  return { tags: next, changed: changed };
}

async function main() {
  if (!fromList.length || !to) {
    console.error('Usage: node scripts/replace-cloudinary-tags.js --from=bnw,noir --to=monochrome [--apply]');
    process.exit(1);
  }

  const cld = cloudinaryApi.cloudinary;
  if (!cld) {
    console.error('Cloudinary not configured.');
    process.exit(1);
  }

  const images = await fetchAllImages(cld);
  const changes = [];
  images.forEach(function (img) {
    const result = rewrite(img.tags);
    if (result.changed) changes.push({ public_id: img.public_id, from: img.tags, to: result.tags });
  });

  console.log((apply ? 'APPLY' : 'DRY-RUN') + ': ' + fromList.join(', ') + ' → ' + to);
  console.log(images.length + ' images, ' + changes.length + ' to update.');
  changes.forEach(function (c) {
    console.log('  ' + c.public_id);
  });

  if (!apply) {
    console.log('\nRe-run with --apply to write to Cloudinary.');
    return;
  }

  for (const c of changes) {
    await cld.uploader.remove_all_tags([c.public_id]);
    if (c.to.length > 0) await cld.uploader.add_tag(c.to.join(','), [c.public_id]);
    console.log('wrote ' + c.public_id);
  }
  console.log('Done. Run: node manifest-generator.js');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
