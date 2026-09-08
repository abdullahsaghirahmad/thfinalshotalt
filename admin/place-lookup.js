/**
 * Place lookup for the local admin tagger.
 * Countries: local list (no API key). Cities: Nominatim, then that list.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'public', 'country-continents.json');
const OK_NOMINATIM_TYPES = new Set([
  'country', 'state', 'region', 'province', 'city', 'town',
  'municipality', 'county', 'administrative', 'island'
]);

const cache = new Map();
let geoData = null;

function loadGeo() {
  if (geoData) return geoData;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    delete raw._comment;
    geoData = {
      countries: raw.countries || {},
      aliases: raw.aliases || {}
    };
  } catch (_) {
    geoData = { countries: {}, aliases: {} };
  }
  return geoData;
}

function toTag(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function fetchJson(url, headers, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, timeoutMs || 7000);
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function uniqueLinks(links) {
  const seen = new Set();
  const out = [];
  (links || []).forEach(function (l) {
    if (!l || !l.child || !l.parent || l.child === l.parent) return;
    const key = l.child + '>' + l.parent;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ child: l.child, parent: l.parent });
  });
  return out;
}

function resultFromLinks(source, userTag, links) {
  const clean = uniqueLinks(links);
  const parents = [];
  const seen = new Set([userTag]);
  function walk(tag) {
    clean.forEach(function (l) {
      if (l.child === tag && !seen.has(l.parent)) {
        seen.add(l.parent);
        parents.push(l.parent);
        walk(l.parent);
      }
    });
  }
  walk(userTag);
  return {
    found: parents.length > 0,
    source: source,
    tag: userTag,
    parents: parents,
    chain: [userTag].concat(parents),
    links: clean
  };
}

function canonicalCountry(rawName) {
  const geo = loadGeo();
  let tag = toTag(rawName);
  if (!tag) return null;
  if (tag.indexOf('the_') === 0) tag = tag.slice(4);
  if (geo.aliases[tag]) tag = geo.aliases[tag];
  if (geo.countries[tag]) return tag;
  return null;
}

function continentOf(countryTag) {
  const geo = loadGeo();
  return geo.countries[countryTag] || null;
}

/** belgium → europe; holland → netherlands → europe */
function linksForCountryQuery(userTag) {
  const geo = loadGeo();
  const links = [];
  let countryTag = userTag;
  if (geo.aliases[userTag]) {
    countryTag = geo.aliases[userTag];
    links.push({ child: userTag, parent: countryTag });
  }
  if (!geo.countries[countryTag]) return [];
  const continent = continentOf(countryTag);
  if (continent && countryTag !== continent) {
    links.push({ child: countryTag, parent: continent });
  }
  return links;
}

async function lookupNominatim(query) {
  const q = query.replace(/_/g, ' ');
  const url = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q='
    + encodeURIComponent(q);
  const data = await fetchJson(url, {
    'User-Agent': 'TheFinalShot-Tagger/1.0 (local admin; photography portfolio)',
    'Accept-Language': 'en'
  }, 7000);
  if (!Array.isArray(data) || data.length === 0) return null;

  const userTag = toTag(query);
  const qLower = q.toLowerCase();
  const hit = data.find(function (row) {
    const t = row.addresstype || row.type || '';
    const cls = row.class || '';
    if (cls === 'amenity' || cls === 'shop' || cls === 'highway') return false;
    if (t === 'village' || t === 'hamlet' || t === 'neighbourhood' || t === 'suburb') return false;
    if (!(OK_NOMINATIM_TYPES.has(t) || (cls === 'boundary' && (t === 'administrative' || t === 'country')))) {
      return false;
    }
    const name = String(row.name || '').toLowerCase();
    const display = String(row.display_name || '').toLowerCase();
    return name === qLower || name.indexOf(qLower) === 0 || display.indexOf(qLower) === 0;
  });
  if (!hit) return null;

  const addr = hit.address || {};
  const countryName = addr.country;
  if (!countryName) return null;

  const countryTag = canonicalCountry(countryName);
  if (!countryTag) return null;
  if (countryTag === userTag) return linksForCountryQuery(userTag);

  const links = [{ child: userTag, parent: countryTag }].concat(linksForCountryQuery(countryTag));
  return links;
}

async function lookupPlace(query, knownParents) {
  const userTag = toTag(query);
  if (!userTag) return { found: false, tag: '', parents: [], chain: [], links: [] };

  const cached = cache.get(userTag);
  if (cached) return cached;

  const fileParents = knownParents || {};
  if (fileParents[userTag]) {
    const ancestors = [];
    const seen = new Set();
    let cur = fileParents[userTag];
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      ancestors.push(cur);
      cur = fileParents[cur];
    }
    const out = {
      found: true,
      source: 'file',
      tag: userTag,
      parents: ancestors,
      chain: [userTag].concat(ancestors),
      links: []
    };
    cache.set(userTag, out);
    return out;
  }

  const countryLinks = linksForCountryQuery(userTag);
  if (countryLinks.length) {
    const out = resultFromLinks('countries', userTag, countryLinks);
    cache.set(userTag, out);
    return out;
  }

  const nomLinks = await lookupNominatim(query);
  if (nomLinks && nomLinks.length) {
    const out = resultFromLinks('nominatim', userTag, nomLinks);
    if (out.found) {
      cache.set(userTag, out);
      return out;
    }
  }

  return { found: false, source: null, tag: userTag, parents: [], chain: [userTag], links: [] };
}

module.exports = {
  toTag,
  lookupPlace
};
