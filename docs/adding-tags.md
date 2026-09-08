# Adding tags — runbook for humans & LLMs

**How to use this file**

If you are an LLM and the user says “follow `docs/adding-tags.md`” (or “add these tags”), treat this document as the source of truth. Read the current `public/tag-taxonomy.json`, `public/tag-synonyms.json`, and `public/tag-hierarchy.json`, apply the rules below, then edit those files (and only those files unless the user also asks to tag images or regenerate manifests).

If you are a human, follow the checklist in order. Paste the prompt section into another chat only if you are not using an agent that can edit the repo directly.

---

## End-to-end checklist (new tag / batch of tags)

Do these steps in order. Skip a step only if it is already done.

### 1. Choose canonical tag names

- Lowercase only.
- Spaces → underscores (`golden hour` → `golden_hour`).
- Prefer **singular** nouns unless plural is already established in the library (`stars`, `clouds`).
- Project series tags must be namespaced: `project:name` (e.g. `project:noir`).
- Prefer reusing an existing tag over inventing a near-duplicate.

### 2. Tag the images

- Local admin: `http://localhost:3001/admin/tagger` (only works when not on Vercel).
- Or tag directly in Cloudinary.
- On save, spaces become underscores. Cloudinary tags must use the same form (`golden_hour`, not `golden hour`). If old spaced tags appear, run `node scripts/normalize-tag-underscores.js --apply`.
- Location hygiene: tag the **most specific** place (`lucknow`, `kerala`, `paris`).
- Known places: the tagger adds parent chips from `public/tag-hierarchy.json`. You can × a parent on that photo; Save writes exactly the chips you leave.
- New places (e.g. `belgium`): the tagger looks up country/continent from a local country list, or Nominatim for cities, and asks **Add parents** or **Just this tag**. Accept also writes the mapping into `tag-hierarchy.json` and puts the tags in the Where group.

### 3. Place tags in the taxonomy

File: `public/tag-taxonomy.json`

- Put each new canonical tag in **exactly one** primary group.
- Priority when ambiguous: `where` > `what` > `how` > `when` > `mood` > `color` > `project`.
- Do not remove existing tags.
- Do not invent tags that were not requested / not present on images.
- Tags missing from this file still work in search, but show under **Other** in the admin tagger and get weaker Discover “best tag” routing.

| Group | Meaning | Examples |
|-------|---------|----------|
| `where` | Locations | `india`, `kerala`, `paris` |
| `what` | Subjects / objects | `moon`, `mountain`, `bird` |
| `how` | Technique / composition | `monochrome`, `long_exposure`, `leading_lines` |
| `when` | Time / season / light | `night`, `golden_hour`, `winter` |
| `mood` | Aesthetic / feel | `dreamy`, `experimental` |
| `color` | Color labels | `blue`, `warm`, `neutral` |
| `project` | Intentional series | `project:duration`, `project:noir` |

### 3b. Location hierarchy (places only)

File: `public/tag-hierarchy.json`

- Child → parent map. Used as the first source when adding a known place.
- City/region → country → continent. Current continents: `asia`, `europe`.
- Example: `"kerala": "india"` and `"india": "asia"`.
- New countries/cities can be accepted from the tagger lookup (no LLM). That writes rows here.
- Optional backfill of missing parents on old images: `node scripts/backfill-location-parents.js --apply`.

### 3c. Discover pills (pin + parent/child collapse)

File: `public/tag-taxonomy.json` — edit these keys, not `server.js`.

**Pinned tags** — `"pinned"` array:

- Canonical tags listed here always appear first in the Discover pill row (same pills, same click behaviour).
- Remaining slots fill by image count, up to 12. Tags with zero images are skipped.
- Example: `"pinned": ["monochrome", "project:experimental"]`
- A pinned tag is never collapsed away. If you pin a location parent (`asia`) and a child would dominate it, the child is skipped instead.

**Location parent/child** — `"featured_parent_share"` (0–1, default `0.8`):

- Write-time hierarchy means a parent always has at least as many images as each child, so raw counts would show both (`asia` and `india`).
- If a descendant has at least this fraction of the parent’s images, the parent is hidden and the child is kept.
- Today: `asia`/`india` at 100% → hide `asia`; `india`/`meghalaya` at ~71% → keep both. Raise toward `1` to collapse only near-duplicates; lower toward `0` to hide more parents.

### 4. Add synonyms (when useful)

File: `public/tag-synonyms.json`

- Keys = what a user might type (lowercase; spaces OK).
- Values = canonical Cloudinary tags (underscores).
- Add plurals, common misspellings, alternate spellings, and related phrases.
- Do **not** add an entry whose key equals its value.
- Do **not** map two distinct real concepts onto one tag.
- Do **not** delete existing synonym entries unless the user asked to clean them up.
- Keep the file’s existing style (aligned columns optional; JSON must remain valid).

### 5. Regenerate manifests

After Cloudinary tags change (or before deploying tag-count / Discover updates):

```bash
node manifest-generator.js
```

This writes/updates files under `public/manifests/` (including `tag-*.json`). On Vercel, `vercel-build` runs the same generator.

### 6. Commit & deploy

When the user asks to commit, include at least:

- `public/tag-taxonomy.json` (if changed)
- `public/tag-synonyms.json` (if changed)
- `public/tag-hierarchy.json` (if a new place was added)
- `public/manifests/**` (if regenerated)

Do not commit secrets (`.env.local`, credentials).

---

## LLM task: update taxonomy + synonyms + location hierarchy

Use this when the user already has (or is about to apply) canonical tags and wants you to update the JSON files.

### Inputs you must load

1. `public/tag-taxonomy.json` (current)
2. `public/tag-synonyms.json` (current)
3. `public/tag-hierarchy.json` (current) — if any new tag is a place
4. The user’s list of new tags (and optional notes)

### Rules (must follow)

1. Canonical form: lowercase, underscores, prefer singular.
2. Each new tag → **one** taxonomy group using priority `where > what > how > when > mood > color > project`.
3. `project` tags must start with `project:`.
4. Do not invent tags; do not remove existing tags/synonyms unless asked.
5. Synonyms: useful aliases only; key ≠ value; value must be a real canonical tag.
6. Prefer editing the existing JSON in place (surgical edits) over rewriting the whole file when possible.
7. If a tag is ambiguous, ask the user — do not guess silently.
8. After edits, briefly report: tag → group, and any new synonym keys.
9. New **places** must get a child → parent row in `public/tag-hierarchy.json` (city → country, country → continent). Do not invent parents the user did not confirm. Continents in this library are `asia` and `europe`.
10. Do not map a continent name to a country in synonyms (`asia` and `europe` are real tags).

### Output / actions

1. Edit `public/tag-taxonomy.json` — append new tags into the correct `tags` arrays.
2. Edit `public/tag-synonyms.json` — append new alias → canonical entries.
3. If any new tag is a location, edit `public/tag-hierarchy.json` (child → parent).
4. List ambiguous tags that still need a human decision.
5. Remind the user to tag images (if not done) and run `node manifest-generator.js` before deploy. Existing images pick up missing parents via `node scripts/backfill-location-parents.js --apply`.

### Do not do unless asked

- Tag Cloudinary assets
- Run `manifest-generator.js` or the backfill script
- Commit / push
- Change Discover UI, server routes, or pin featured pills

---

## Standalone prompt (paste into a chat without repo access)

```text
Follow the rules in docs/adding-tags.md for this photography portfolio.

TASK
Given NEW tags, update:
1) public/tag-taxonomy.json — one primary group per tag
2) public/tag-synonyms.json — useful aliases → canonical tags
3) public/tag-hierarchy.json — child → parent for new places

RULES
- Canonical: lowercase, spaces → underscores; prefer singular
- One group only; priority: where > what > how > when > mood > color > project
- project tags must be project:name
- Do not invent or remove tags
- Synonym keys = user-typed (spaces OK); values = canonical; never key === value
- Do not map distinct concepts to one tag

GROUPS
- where: locations
- what: subjects/objects
- how: technique/composition
- when: time/season/light
- mood: aesthetic/feel
- color: color labels
- project: intentional series (project:…)

EXISTING FILES
<<<PASTE CURRENT public/tag-taxonomy.json>>>
<<<PASTE CURRENT public/tag-synonyms.json>>>
<<<PASTE CURRENT public/tag-hierarchy.json>>>

NEW TAGS
<<<one per line>>>

OUTPUT
1) For each new tag: group + one-line reason
2) Full updated tag-taxonomy.json
3) Full updated tag-synonyms.json (keep existing entries; add new ones)
4) Full updated tag-hierarchy.json if any new places
5) Ambiguous tags needing my decision
```

---

## Quick examples

| New tag | Group | Synonyms to consider |
|---------|-------|----------------------|
| `kerala` | `where` | hierarchy: `kerala` → `india` → `asia` |
| `lotus` | `what` | `lotuses`, `water lily` (only if lily ≈ lotus in your library) |
| `fill_the_frame` | `how` | `fill the frame`, `tight crop` |
| `golden_hour` | `when` | `golden hour`, `magic hour` |
| `project:winter` | `project` | usually none (users should search the project name) |

---

## Related files (context)

| File | Role |
|------|------|
| `public/tag-taxonomy.json` | Admin vocabulary groups + Discover pills (`pinned`, `featured_parent_share`) + best-tag priority |
| `public/tag-synonyms.json` | Discover / API search alias resolution |
| `public/tag-hierarchy.json` | Location child → parent (written onto images when you accept) |
| `public/country-continents.json` | Country/alias → continent for tagger lookup (no API key) |
| `tag-hierarchy.js` | Shared expand helper for tagger save + backfill |
| `admin/tagger.html` | Local bulk tagger UI |
| `manifest-generator.js` | Builds `public/manifests/*` from Cloudinary |
| `discover.js` | Loads taxonomy + synonyms; prefers most specific place for carousel |
