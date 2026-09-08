/**
 * Location tag inheritance (child → parent).
 * Tagging lucknow also writes india and asia onto the image.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HIERARCHY_PATH = path.join(__dirname, 'public', 'tag-hierarchy.json');

function loadParents() {
  try {
    const raw = JSON.parse(fs.readFileSync(HIERARCHY_PATH, 'utf8'));
    delete raw._comment;
    return raw;
  } catch (_) {
    return {};
  }
}

function ancestorsOf(tag, parents) {
  const out = [];
  const seen = new Set();
  let cur = parents[tag];
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = parents[cur];
  }
  return out;
}

function isAncestorOf(ancestor, descendant, parents) {
  return ancestorsOf(descendant, parents).indexOf(ancestor) !== -1;
}

/** Tags that are not parents of another tag in the same list (the specific places). */
function locationSeeds(tags, parents) {
  const list = (tags || []).filter(Boolean);
  return list.filter(function (t) {
    return !list.some(function (other) {
      return other !== t && isAncestorOf(t, other, parents);
    });
  });
}

/**
 * Union of the given tags plus every location ancestor.
 * Preserves first-seen order: original tags, then parents from specific → general.
 */
function withLocationParents(tags, parents) {
  const map = parents || {};
  const result = [];
  const seen = new Set();
  function add(t) {
    if (!t || seen.has(t)) return;
    seen.add(t);
    result.push(t);
  }
  (tags || []).forEach(function (t) {
    add(t);
    ancestorsOf(t, map).forEach(add);
  });
  return result;
}

const HIERARCHY_COMMENT = 'Location inheritance: child → parent. Tagging a child also writes every ancestor onto the image (lucknow → india → asia). Search stays exact-tag. Add a row when you add a new place.';

function saveParentLinks(links) {
  const raw = JSON.parse(fs.readFileSync(HIERARCHY_PATH, 'utf8'));
  const comment = raw._comment || HIERARCHY_COMMENT;
  delete raw._comment;
  (links || []).forEach(function (l) {
    if (!l || !l.child || !l.parent || l.child === l.parent) return;
    raw[l.child] = l.parent;
  });
  const out = { _comment: comment };
  Object.keys(raw).forEach(function (k) { out[k] = raw[k]; });
  fs.writeFileSync(HIERARCHY_PATH, JSON.stringify(out, null, 2) + '\n');
  return loadParents();
}

function addWhereTags(tags) {
  const TAXONOMY_PATH = path.join(__dirname, 'public', 'tag-taxonomy.json');
  const tax = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf8'));
  if (!tax.where) tax.where = { label: '📍 Where', tags: [] };
  const have = new Set(tax.where.tags || []);
  let changed = false;
  (tags || []).forEach(function (t) {
    if (!t || have.has(t)) return;
    tax.where.tags.push(t);
    have.add(t);
    changed = true;
  });
  if (changed) {
    fs.writeFileSync(TAXONOMY_PATH, JSON.stringify(tax, null, 2) + '\n');
  }
  return tax;
}

module.exports = {
  loadParents,
  ancestorsOf,
  isAncestorOf,
  locationSeeds,
  withLocationParents,
  saveParentLinks,
  addWhereTags
};

if (require.main === module) {
  const parents = loadParents();
  const expanded = withLocationParents(['lucknow', 'architecture'], parents);
  const seeds = locationSeeds(['lucknow', 'india', 'asia', 'architecture'], parents);
  const paris = withLocationParents(['paris'], parents);
  const ok = expanded.indexOf('lucknow') !== -1
    && expanded.indexOf('india') !== -1
    && expanded.indexOf('asia') !== -1
    && expanded.indexOf('architecture') !== -1
    && seeds.join() === 'lucknow,architecture'
    && paris.join() === 'paris,france,europe';
  if (!ok) {
    console.error('tag-hierarchy self-check failed', { expanded, seeds, paris });
    process.exit(1);
  }
  console.log('tag-hierarchy ok:', expanded.join(', '));
}
