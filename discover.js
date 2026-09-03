/**
 * discover.js — The Final Shot / Discover page
 *
 * Three.js carousel mechanics reverse-engineered from unveil.fr source:
 *
 *   Camera:    FOV = 5°, position = (0, 100/7.5, 35), lookAt(0,0,0)
 *   Cards:     base 1.5×1.5, scaled by image aspect ratio
 *   Rotation:  rotation.y = -Math.PI/6 (-30°), x=0, z=0
 *   Layout:    spacing G=0.375, position.z = -position.x * aspect * 1.5
 *              position.x = gWrap(-F, F, (i - scrollPos) * G)
 *   Scroll:    deltaY / 25 → targetScrollPos, smooth lerp 0.10
 *   Visible:   |z| < 12.5 only
 *   Background: #fafafa
 *
 * The GSAP-style wrap makes the carousel infinite with no deck duplication.
 */

'use strict';

/* ── GSAP-style modular wrap (no GSAP dependency) ──────────────────────── */
function gWrap(min, max, val) {
  var range = max - min;
  return min + (((val - min) % range) + range) % range;
}

/* ── Exact shaders from unveil.fr source (verbatim) ────────────────────── */
var VERT_SHADER = [
  'precision mediump float;',
  'varying vec2 vUv;',
  'void main () {',
  '  vUv = uv;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');

/* Fragment shader: cover-fit UV, 0.15-margin edge vignette, blur-to-sharp blend.
   uOpacity added for distance-based fade (not in original, added by us). */
var FRAG_SHADER = [
  'precision mediump float;',
  'uniform vec2 uMeshSize;',
  'uniform vec2 uImageSize;',
  'uniform sampler2D uImageTexture;',
  'uniform sampler2D uBlurTexture;',
  'uniform float uSaturation;',
  'uniform float uOpacity;',
  'varying vec2 vUv;',
  'void main() {',
  '  vec2 ratio = vec2(',
  '    min((uMeshSize.x / uMeshSize.y) / (uImageSize.x / uImageSize.y), 1.0),',
  '    min((uMeshSize.y / uMeshSize.x) / (uImageSize.y / uImageSize.x), 1.0)',
  '  );',
  '  vec2 uvCover = vec2(',
  '    vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,',
  '    vUv.y * ratio.y + (1.0 - ratio.y) * 0.5',
  '  );',
  '  vec4 progress = vec4(1.0, 1.0, 1.0, 1.0);',
  '  float margin = 0.15;',
  '  if (vUv.x < margin)       progress.rgb *= smoothstep(0.0, margin,       vUv.x);',
  '  if (vUv.x > 1.0 - margin) progress.rgb *= smoothstep(1.0, 1.0 - margin, vUv.x);',
  '  if (vUv.y < margin)       progress.rgb *= smoothstep(0.0, margin,       vUv.y);',
  '  if (vUv.y > 1.0 - margin) progress.rgb *= smoothstep(1.0, 1.0 - margin, vUv.y);',
  '  vec4 blurTexture  = texture2D(uBlurTexture,  uvCover);',
  '  vec4 imageTexture = texture2D(uImageTexture, uvCover);',
  '  blurTexture.a *= 0.75;',
  '  vec4 color = mix(imageTexture, blurTexture, 1.0 - progress.r);',
  // Distance fade applied to final alpha
  '  gl_FragColor = vec4(color.rgb, color.a * uOpacity);',
  '}'
].join('\n');


/* ════════════════════════════════════════════════════════════════
   DiscoverGallery — State 2: filmstrip + main photo
   ════════════════════════════════════════════════════════════════ */

class DiscoverGallery {
  constructor() {
    this.thumbsEl    = document.getElementById('gallery-thumbs');
    this.focusEl     = document.getElementById('gallery-focus');
    this.phatEl      = document.getElementById('phat-scroll-gallery');
    this.tagBarEl    = document.getElementById('gallery-tag-line');
    this.infoBtn     = document.getElementById('gallery-info-btn');
    this.indexBtn    = document.getElementById('gallery-index-btn');
    this.backBottom  = document.getElementById('gallery-back-bottom');
    this.infoPanel   = document.getElementById('gallery-info-panel');
    this.infoClose   = document.getElementById('gallery-info-close');
    this.infoContent = document.getElementById('gallery-info-content');

    this.images       = [];
    this.activeIndex  = 0;
    this.activeTag    = '';      // the tag that was the entry point
    this.thumbItems   = [];
    this.focusItems   = [];
    this.itemPositions = new Map();
    this.autoSelectEnabled = false;  // gates bell-curve auto-select until initial scroll is set
    this._cachedBodyH = 0;

    this.pseudoIndexEl = document.getElementById('gallery-pseudo-index'); // always-grid BCR source

    this.scrollY       = 0;
    this.springY       = 0;
    this.scrollRafId   = null;
    this.bellRafId     = null;

    this._onKeydown    = this._handleKeydown.bind(this);
    this._onScroll     = function() { this.scrollY = window.scrollY; }.bind(this);
    this._cleanupResize = null;
  }

  async load(sourceId, sourceType, activeTag, clickedImageId) {
    var self = this;  // needed for nested callbacks below
    sourceType = sourceType || 'category';
    self.activeTag   = activeTag || sourceId;
    self.entryType   = sourceType;   // stored so tag bar can hide for category entries
    self.clickedImageId = clickedImageId || null;
    var images = [];
    try {
      if (sourceType === 'category') {
        var res  = await fetch('/api/manifests/' + encodeURIComponent(sourceId));
        var data = await res.json();
        images = (data.images || []).map(function(img, i) {
          return { id: i, url: img.secure_url || img.url || '',
                   publicId: img.public_id || '', tags: img.tags || [],
                   imgWidth: img.width || 0, imgHeight: img.height || 0 };
        });
      } else {
        var res2  = await fetch('/api/tag-images?tag=' + encodeURIComponent(sourceId));
        var data2 = await res2.json();
        images = (data2.images || []).map(function(img, i) {
          return { id: i, url: img.secure_url || img.url || '',
                   publicId: img.public_id || '', tags: img.tags || [],
                   imgWidth: img.width || 0, imgHeight: img.height || 0 };
        });
      }
    } catch (err) {
      console.error('[DiscoverGallery] load error:', err);
    }

    self.images = images;
    self._injectDOM();
    self._initVirtualScroll();
    self._initBellCurve();
    self._initKeyboard();
    self._bindBottomNav();

    requestAnimationFrame(function() {
      document.body.classList.add('gallery-has-loaded');
    });

    if (images.length > 0) {
      // Find the image the user clicked so the gallery opens on that exact photo
      var initialIndex = 0;
      if (self.clickedImageId) {
        for (var k = 0; k < images.length; k++) {
          if (images[k].publicId === self.clickedImageId ||
              (images[k].url && images[k].url.indexOf(self.clickedImageId) !== -1)) {
            initialIndex = k;
            break;
          }
        }
      }

      // Set crossfade immediately so the photo appears right away
      if (self.focusItems[initialIndex]) {
        self.focusItems[initialIndex].classList.add('is--active');
        self.activeIndex = initialIndex;
        self._updateTagBar(images[initialIndex].tags || []);
      }

      // Jump the scroll spring INSTANTLY to the initial item's position.
      // This matches the reference (gregorcollienne scrollToGalleryItem):
      //   window.scrollTo(0, n);  scrollStartY = n;  ← spring skips to target
      // We also set self.scrollY and self.springY so the bell-curve never
      // sees item 0 as "closest" — it starts at the correct item.
      requestAnimationFrame(function() {
        document.body.classList.add('gallery-has-loaded');

        requestAnimationFrame(function() {
          if (self.thumbItems[initialIndex]) {
            var item    = self.thumbItems[initialIndex];
            var targetY = Math.max(0, item.offsetTop + item.offsetHeight / 2 - window.innerHeight / 2);

            window.scrollTo({ top: targetY });
            self.scrollY = targetY;   // virtual-scroll next reads this
            self.springY = targetY;   // spring starts at target, not from 0
          }

          // Enable bell-curve auto-select one frame later (spring is now at target)
          requestAnimationFrame(function() {
            self.autoSelectEnabled = true;
          });
        });
      });
    }
  }

  _injectDOM() {
    while (this.thumbsEl.firstChild) this.thumbsEl.removeChild(this.thumbsEl.firstChild);
    while (this.focusEl.firstChild)  this.focusEl.removeChild(this.focusEl.firstChild);
    this.thumbItems    = [];
    this.focusItems    = [];
    this.itemPositions = new Map();

    // Clear pseudo index container
    if (this.pseudoIndexEl) {
      while (this.pseudoIndexEl.firstChild) this.pseudoIndexEl.removeChild(this.pseudoIndexEl.firstChild);
    }

    var self = this;
    this.images.forEach(function(img, i) {
      var item = document.createElement('div');
      item.className = 'gallery-thumbs__item';
      item.dataset.index = i;   // needed for scroll-auto-select
      item.style.setProperty('--startdelay', i);

      var inner = document.createElement('div');
      inner.className = 'gallery-thumb-inner';
      var thumb = document.createElement('img');
      thumb.src = img.url; thumb.alt = ''; thumb.loading = 'lazy'; thumb.draggable = false;
      // Set explicit width/height from Cloudinary dimensions so the filmstrip
      // has correct height immediately (no waiting for lazy images to load).
      // This gives the virtual scroll the correct body height from the first frame.
      if (img.imgWidth && img.imgHeight) {
        var thumbH = Math.round(img.imgHeight / img.imgWidth * 80);
        thumb.width = 80;
        thumb.height = thumbH;
        thumb.style.height = thumbH + 'px';
      }
      inner.appendChild(thumb);
      item.appendChild(inner);
      item.addEventListener('click', function() {
        if (document.body.classList.contains('gallery-index--open')) {
          // INDEX mode: select this image (updates activeIndex for stagger + main photo)
          // then close the grid — _closeIndex reads self.activeIndex which is now i
          self.selectImage(i, true);  // true = skip filmstrip scroll (no body height yet)
          self._closeIndex();
        } else {
          self.selectImage(i);
        }
      });
      self.thumbsEl.appendChild(item);
      self.thumbItems.push(item);
      self.itemPositions.set(item, 0);

      // ── INDEX pseudo item — mirrors this item's size at 176px width ──────────
      // Lives in #gallery-pseudo-index which is position:fixed + always in grid
      // layout. BCRs are read from here in _openIndex() so grid target positions
      // are always correct regardless of where phat-scroll is scrolled to.
      if (self.pseudoIndexEl) {
        var pseudo = document.createElement('div');
        pseudo.className = 'gallery-pseudo-item';
        pseudo.dataset.index = i;
        // Height = natural aspect ratio scaled to 176px width
        if (img.imgWidth && img.imgHeight) {
          pseudo.style.height = Math.round(img.imgHeight / img.imgWidth * 176) + 'px';
        } else {
          pseudo.style.height = '264px'; // default ~2:3 portrait ratio
        }
        self.pseudoIndexEl.appendChild(pseudo);
      }

      var fi = document.createElement('div');
      fi.className = 'gallery-focus__item';
      fi.dataset.index = i;   // needed for scroll-auto-select
      var mainImg = document.createElement('img');
      mainImg.src = img.url; mainImg.alt = ''; mainImg.loading = i===0?'eager':'lazy'; mainImg.draggable = false;      fi.appendChild(mainImg);
      self.focusEl.appendChild(fi);
      self.focusItems.push(fi);
    });

    var updateH = function() {
      // Reference (gregorcollienne PhatAction): body.height = phatscroll.offsetHeight
      // NO + window.innerHeight. This gives:
      //   scrollY = 0   → first item centered (via padding-top = 50vh - firstH/2)
      //   scrollY = max → last item centered (via padding-bottom = 50vh - lastH/2)
      // Also makes scroll speed match reference (range = actual content, not inflated).
      var h = self.phatEl.offsetHeight || self.thumbsEl.scrollHeight;
      if (h > 100) document.body.style.height = h + 'px';
    };
    requestAnimationFrame(updateH);
    setTimeout(updateH, 400);
    setTimeout(updateH, 1200);
    window.addEventListener('resize', updateH);
    this._cleanupResize = function() { window.removeEventListener('resize', updateH); };

    requestAnimationFrame(function() {
      if (self.thumbItems.length > 0) {
        self.thumbsEl.style.setProperty('--first-item-h', self.thumbItems[0].offsetHeight + 'px');
        self.thumbsEl.style.setProperty('--last-item-h', self.thumbItems[self.thumbItems.length-1].offsetHeight + 'px');
      }
    });
  }

  selectImage(index, skipScroll) {
    var clamped = Math.max(0, Math.min(this.images.length - 1, index));
    if (this.focusItems[this.activeIndex]) this.focusItems[this.activeIndex].classList.remove('is--active');
    if (this.focusItems[clamped]) this.focusItems[clamped].classList.add('is--active');
    this.activeIndex = clamped;
    // Update tag navigation bar for this image
    this._updateTagBar(this.images[clamped] ? (this.images[clamped].tags || []) : []);

    if (skipScroll !== true && this.thumbItems[clamped]) {
      var item = this.thumbItems[clamped];
      var targetY = Math.max(0, item.offsetTop + item.offsetHeight / 2 - window.innerHeight / 2);
      // 'instant' = no animation (used for initial load); anything else = smooth
      window.scrollTo({ top: targetY, behavior: skipScroll === 'instant' ? 'instant' : 'smooth' });
    }
  }

  /* ── Tag navigation bar ──────────────────────────────────────
     Only shown for tag-type galleries (not folder/category entries).
     Active tag is underlined like the site nav; others at reduced opacity. */
  _updateTagBar(imageTags) {
    if (!this.tagBarEl) return;

    // Don't show tag bar for folder-based galleries (Featured, BnW, etc.)
    // — folder names shouldn't appear as if they were photographer-applied tags
    if (this.entryType !== 'tag') {
      this.tagBarEl.style.display = 'none';
      return;
    }
    this.tagBarEl.style.display = '';

    while (this.tagBarEl.firstChild) this.tagBarEl.removeChild(this.tagBarEl.firstChild);

    var self = this;
    var tags = (imageTags && imageTags.length > 0) ? imageTags : (this.activeTag ? [this.activeTag] : []);
    // Always show the active (entry) tag first
    var ordered = [this.activeTag];
    tags.forEach(function(t) { if (t !== self.activeTag) ordered.push(t); });

    ordered.forEach(function(tag) {
      if (!tag) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gallery-tag-label' + (tag === self.activeTag ? ' is--active' : '');
      btn.textContent = tag;
      btn.addEventListener('click', function() {
        if (self._onTagClick) self._onTagClick(tag);
      });
      self.tagBarEl.appendChild(btn);
    });
  }

  _initVirtualScroll() {
    this.scrollY = window.scrollY; this.springY = window.scrollY;
    window.addEventListener('scroll', this._onScroll);
    var self = this;
    var loop = function() {
      self.springY += (self.scrollY - self.springY) * 0.03;
      self.phatEl.style.top = (-self.springY) + 'px';

      // Update body height every frame — exact match to gregorcollienne PhatAction:
      //   const t = e.offsetHeight;
      //   document.querySelector("body").style.height = t + "px";
      // Cache the last value to avoid unnecessary DOM writes.
      var h = self.phatEl.offsetHeight || self.thumbsEl.scrollHeight;
      if (h > 100 && h !== self._cachedBodyH) {
        self._cachedBodyH = h;
        document.body.style.height = h + 'px';
      }

      self.scrollRafId = requestAnimationFrame(loop);
    };
    loop();
  }

  _initBellCurve() {
    var MAX_OFFSET = 64, FALLOFF_R = 280, LERP = 0.08, self = this;
    var loop = function() {
      var vcenter  = window.innerHeight / 2;
      var minDist  = Infinity;
      var closestIdx = self.activeIndex;

      self.thumbItems.forEach(function(el, idx) {
        var rect   = el.getBoundingClientRect();
        var mid    = rect.top + rect.height / 2;
        var d      = Math.abs(mid - vcenter);
        var target = d < FALLOFF_R ? Math.pow(1 - d/FALLOFF_R, 2) * MAX_OFFSET : 0;
        var prev   = self.itemPositions.get(el) || 0;
        var cur    = prev + (target - prev) * LERP;
        self.itemPositions.set(el, cur);
        el.style.transform = 'translateX(' + cur + 'px)';

        // Track which thumb is closest to viewport center
        if (d < minDist) { minDist = d; closestIdx = idx; }
      });

      // Auto-select the centered thumbnail — matches gregorcollienne.com Gallery() loop
      // Only enabled after the initial spring jump so we never override initialIndex
      if (self.autoSelectEnabled && closestIdx !== self.activeIndex) {
        self.selectImage(closestIdx, true);
      }

      self.bellRafId = requestAnimationFrame(loop);
    };
    loop();
  }

  _initKeyboard() { document.addEventListener('keydown', this._onKeydown); }

  _handleKeydown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.selectImage(this.activeIndex + 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); this.selectImage(this.activeIndex - 1); }
  }

  _bindBottomNav() {
    var self = this;
    if (this.indexBtn) this.indexBtn.onclick = function() { self.toggleIndex(); };
    if (this.infoBtn)  this.infoBtn.onclick  = function() { self.toggleInfo();  };
    if (this.infoClose) this.infoClose.onclick = function() { self.closeInfo(); };
  }

  toggleIndex() {
    /* ── Animated INDEX toggle — exact gregorcollienne.com mechanic ──────────
     * Opening:  items fly from filmstrip positions (scroll reset to 0) → grid
     * Closing:  items fly from grid positions → filmstrip (scroll reset to 0)
     * Stagger:  transition-delay = abs(i − activeIdx) × 15ms per item
     ──────────────────────────────────────────────────────────────────────── */
    var isOpen      = document.body.classList.contains('gallery-index--open');
    var isAnimating = document.body.classList.contains('gallery-index--isopening') ||
                      document.body.classList.contains('gallery-index--isclosing');
    if (isAnimating) return;   // prevent double-click during flight

    if (isOpen) {
      this._closeIndex();
    } else {
      this._openIndex();
    }
  }

  _openIndex() {
    /* ── OPEN: filmstrip → INDEX grid ─────────────────────────────────────────
     * Root-cause fix for "images disappear + appear with jerk when at bottom":
     *
     *  OLD BUG: BCRs were read with phat-scroll at -springY, so grid and filmstrip
     *           positions were both shifted by -springY (negative = off-screen).
     *           Items got pinned off-screen and looked like they disappeared.
     *
     *  FIX:
     *   1. Instantly reset scroll/spring to 0  → items at their natural positions.
     *   2. Set body.height='auto' immediately  → freezes spring at 0 during animation.
     *   3. Read filmstrip BCRs at scroll=0     → always within viewport.
     *   4. Read grid BCRs from #gallery-pseudo-index (position:fixed, outside
     *      phat-scroll) → always correct regardless of scroll position.
     *   5. Animate with reference timing: setTimeout(1) pin, setTimeout(20) fly.
     *                                                                             */
    var self = this, items = self.thumbItems, activeIdx = self.activeIndex;
    if (!items.length) return;

    // 1. Stop bell-curve from fighting with us
    self.autoSelectEnabled = false;

    // 2. INSTANTLY reset scroll/spring to 0 — this is the core fix.
    //    All items are now at their natural filmstrip positions (from the top).
    self.scrollY = 0;
    self.springY = 0;
    window.scrollTo(0, 0);
    self.phatEl.style.top = '0px';

    // 3. Freeze the virtual-scroll spring for the duration of the animation.
    //    body.height='auto' means window.scrollY stays 0, spring stays at 0.
    document.body.style.height = 'auto';
    self._cachedBodyH = 0;

    // 4. Clear bell-curve transforms so filmstrip BCRs are at natural positions
    items.forEach(function(el) {
      self.itemPositions.set(el, 0);
      el.style.transform = 'none';
    });

    // 5. Compute stagger delays (distance from active item)
    var maxDelay = 0;
    items.forEach(function(el, i) {
      var d = Math.abs(i - activeIdx);
      if (d > maxDelay) maxDelay = d;
      el.style.setProperty('--startdelay', d);
    });

    // 6. Read target grid positions from #gallery-pseudo-index.
    //    This container is position:fixed + always in grid layout — BCRs are
    //    pixel-perfect regardless of where phat-scroll is (exact reference pattern).
    var gridPos = [];
    if (self.pseudoIndexEl) {
      var pseudoList = self.pseudoIndexEl.querySelectorAll('.gallery-pseudo-item');
      pseudoList.forEach(function(el) {
        var idx = parseInt(el.dataset.index, 10);
        if (!isNaN(idx)) gridPos[idx] = el.getBoundingClientRect();
      });
    }

    // Fallback: measuring class (scroll is 0 now, so positions are correct)
    var allValid = items.length > 0 &&
      items.every(function(el, i) { return gridPos[i] && gridPos[i].width > 0; });
    if (!allValid) {
      document.body.classList.add('gallery-index--measuring');
      items.forEach(function(el, i) { gridPos[i] = el.getBoundingClientRect(); });
      document.body.classList.remove('gallery-index--measuring');
    }

    // 7. Read current filmstrip BCRs (scroll is 0, all items at natural positions)
    var filmPos = items.map(function(el) {
      return el.getBoundingClientRect();
    });

    // 8. Mark preparing state (hides main photo while items are in flight)
    document.body.classList.add('gallery-index--ispreparing');

    // 9. Set positions at filmstrip locations WITHOUT transition (exact reference step)
    items.forEach(function(el, i) {
      el.style.transition = 'none';
      el.style.left = filmPos[i].left + 'px';
      el.style.top  = filmPos[i].top  + 'px';
    });

    // 10. Apply position:fixed — 1ms matches reference timing exactly
    setTimeout(function() {
      items.forEach(function(el) { el.style.position = 'fixed'; });
    }, 1);

    // 11. Enable transition + fly to grid — 20ms matches reference timing exactly.
    //     Width expands to grid size simultaneously (no width transition, instant).
    setTimeout(function() {
      document.body.classList.add('gallery-index--isopening');
      items.forEach(function(el, i) {
        var gp = gridPos[i];
        if (!gp) return;
        el.style.left  = gp.left  + 'px';
        el.style.top   = gp.top   + 'px';
        el.style.width = gp.width + 'px';
      });

      // 12. After flight: release into grid layout (remove inline styles)
      var dur = 800 + 15 * Math.min(maxDelay, 40);
      setTimeout(function() {
        items.forEach(function(el) {
          el.style.position  = '';
          el.style.left      = '';
          el.style.top       = '';
          el.style.width     = '';
          el.style.transition = '';
          el.style.transform  = '';
        });
        document.body.classList.remove('gallery-index--ispreparing', 'gallery-index--isopening');
        document.body.classList.add('gallery-index--open');
        if (self.indexBtn) self.indexBtn.classList.add('is--active');
        // body.height stays 'auto' — spring stays at 0 while INDEX grid is open
      }, dur + 50);
    }, 20);
  }

  _closeIndex() {
    /* ── CLOSE: INDEX grid → filmstrip ────────────────────────────────────────
     * Mirror of _openIndex() fix: reset scroll to 0 so filmstrip BCRs are
     * viewport-correct, then animate items back from grid → filmstrip.
     * After animation: restore body height + scroll to center active item.
     *                                                                          */
    var self = this, items = self.thumbItems, activeIdx = self.activeIndex;
    if (!items.length) return;

    // Stagger from active item
    var maxDelay = 0;
    items.forEach(function(el, i) {
      var d = Math.abs(i - activeIdx);
      if (d > maxDelay) maxDelay = d;
      el.style.setProperty('--startdelay', d);
    });

    // 1. Read GRID positions while items are still in grid layout.
    //    (body.height='auto' means scrollY=0, phatEl.top=0 — positions are correct)
    var gridPos = items.map(function(el) { return el.getBoundingClientRect(); });

    // 2. Remove INDEX open state → items snap back to filmstrip column layout.
    //    phat-scroll is at top=0 (spring has been frozen at 0 since INDEX opened).
    document.body.classList.remove('gallery-index--open');
    if (self.indexBtn) self.indexBtn.classList.remove('is--active');

    // 3. Explicitly ensure phat-scroll top is 0 (it should be, but be explicit)
    self.phatEl.style.top = '0px';

    // 4. Read filmstrip BCRs AFTER layout switch (synchronous — getBCR forces layout).
    //    Scroll is 0, phat-scroll is at 0: items are at their natural top positions.
    var filmPos = items.map(function(el) { return el.getBoundingClientRect(); });

    // 5. Add closing class + pin items at GRID positions (no transition yet)
    document.body.classList.add('gallery-index--isclosing');
    items.forEach(function(el, i) {
      el.style.transition = 'none';
      el.style.left  = gridPos[i].left + 'px';
      el.style.top   = gridPos[i].top  + 'px';
      el.style.width = '176px';
    });

    // 6. Apply position:fixed — 1ms reference timing
    setTimeout(function() {
      items.forEach(function(el) { el.style.position = 'fixed'; });
    }, 1);

    // 7. Enable transition + fly to filmstrip positions — 20ms reference timing
    setTimeout(function() {
      items.forEach(function(el, i) {
        el.style.left  = filmPos[i].left + 'px';
        el.style.top   = filmPos[i].top  + 'px';
        el.style.width = '80px'; // filmstrip thumb width
      });

      var dur = 800 + 15 * Math.min(maxDelay, 40);
      setTimeout(function() {
        // 8. Release items back into filmstrip flow
        items.forEach(function(el) {
          el.style.position  = '';
          el.style.left      = '';
          el.style.top       = '';
          el.style.width     = '';
          el.style.transition = '';
          el.style.transform  = '';
        });
        document.body.classList.remove('gallery-index--isclosing', 'gallery-index--ispreparing');

        // 9. Restore body height for virtual scroll (re-enables scrolling)
        var h = self.phatEl.offsetHeight || self.thumbsEl.scrollHeight;
        if (h > 100) { document.body.style.height = h + 'px'; self._cachedBodyH = h; }

        // 10. Scroll to center the active item (spring lerps smoothly from 0)
        if (self.thumbItems[activeIdx]) {
          var el = self.thumbItems[activeIdx];
          var targetY = Math.max(0, el.offsetTop + el.offsetHeight / 2 - window.innerHeight / 2);
          window.scrollTo({ top: targetY });
          self.scrollY = targetY;
          // Leave springY at 0 so the spring lerps smoothly into position
        }

        // 11. Re-enable bell-curve auto-select after spring has started settling
        setTimeout(function() { self.autoSelectEnabled = true; }, 300);
      }, dur + 50);
    }, 20);
  }

  toggleInfo() {
    if (!this.infoPanel) return;
    if (this.infoPanel.style.display === 'block') {
      this.closeInfo();
    } else {
      this.infoPanel.style.display = 'block';
      var gEl = document.getElementById('discover-gallery');
      if (gEl) gEl.classList.add('info-open');
      if (this.infoBtn) this.infoBtn.classList.add('is--active');
      if (this.infoContent) {
        this.infoContent.textContent = 'Image ' + (this.activeIndex+1) + ' of ' + this.images.length;
      }
    }
  }

  closeInfo() {
    if (this.infoPanel) this.infoPanel.style.display = 'none';
    var gEl = document.getElementById('discover-gallery');
    if (gEl) gEl.classList.remove('info-open');
    if (this.infoBtn) this.infoBtn.classList.remove('is--active');
  }

  destroy() {
    if (this.scrollRafId) cancelAnimationFrame(this.scrollRafId);
    if (this.bellRafId)   cancelAnimationFrame(this.bellRafId);
    window.removeEventListener('scroll', this._onScroll);
    document.removeEventListener('keydown', this._onKeydown);
    if (this._cleanupResize) this._cleanupResize();
    while (this.thumbsEl.firstChild) this.thumbsEl.removeChild(this.thumbsEl.firstChild);
    while (this.focusEl.firstChild)  this.focusEl.removeChild(this.focusEl.firstChild);
    if (this.tagBarEl) { while (this.tagBarEl.firstChild) this.tagBarEl.removeChild(this.tagBarEl.firstChild); }
    if (this.pseudoIndexEl) { while (this.pseudoIndexEl.firstChild) this.pseudoIndexEl.removeChild(this.pseudoIndexEl.firstChild); }
    this.thumbItems = []; this.focusItems = []; this.itemPositions = new Map();
    document.body.style.height = '';
    document.body.classList.remove('gallery-has-loaded', 'gallery-index--open', 'gallery-is-open');
    this.phatEl.style.top = '0px';
    this.images = []; this.activeIndex = 0; this.scrollY = 0; this.springY = 0;
    this.autoSelectEnabled = false;
    this._cachedBodyH = 0;
    this.entryType = '';
    if (this.tagBarEl) this.tagBarEl.style.display = '';
    this.closeInfo();
  }
}


/* ════════════════════════════════════════════════════════════════
   DiscoverCarousel — State 1: Three.js 3D card fan
   Exact mechanics from unveil.fr source code.
   ════════════════════════════════════════════════════════════════ */

class DiscoverCarousel {
  constructor(onEnterGallery) {
    this.onEnterGallery = onEnterGallery;

    this.canvas    = document.getElementById('three-canvas');
    this.labelEl   = document.getElementById('card-label');
    this.searchEl  = document.getElementById('discover-search');
    this.pillsEl   = document.getElementById('tag-pills');

    this.renderer  = null;
    this.scene     = null;
    this.camera    = null;
    this.raycaster = null;
    this.mouseNDC  = null;

    this.cards      = [];
    this.cardMeshes = [];   // invisible hitboxes — raycasting targets (never move)
    this.visuals    = [];   // visible ShaderMaterial meshes — move on hover

    // Scroll state — smooth lerp from raw deltaY
    this.scrollPos        = 0;   // current smoothed position
    this.targetScrollPos  = 0;   // target (accumulates deltaY / 25)

    this.hoveredCard      = null;
    this.availableTags    = [];
    this.animationRunning = false;

    this._onWheel     = this._handleWheel.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onClick     = this._handleClick.bind(this);
    this._onResize    = this._handleResize.bind(this);
    this._animate     = this._animateFrame.bind(this);
  }

  /* ── Init ─────────────────────────────────────────────────────── */
  async init() {
    if (typeof THREE === 'undefined') {
      console.error('[DiscoverCarousel] THREE.js not loaded');
      return;
    }

    // Renderer — background #fafafa (matches unveil.fr)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0xfafafa, 1);

    this.scene = new THREE.Scene();

    // Camera — unveil.fr exact values:
    //   FOV 5°  (very narrow = telephoto compression, cards appear large)
    //   Position: (0, 100/7.5, 35)  ≈  (0, 13.33, 35)
    //   Portrait screens (w<h): z=55 instead of 35
    var w = window.innerWidth, h = window.innerHeight;
    var aspect = w / h;
    this.camera = new THREE.PerspectiveCamera(5, aspect, 0.1, 1000);
    this.camera.position.set(0, 100/7.5, w < h ? 55 : 35);
    this.camera.lookAt(0, 0, 0);

    this.raycaster = new THREE.Raycaster();
    this.mouseNDC  = new THREE.Vector2();

    // Load card data and create meshes
    var cardData = await this._buildCardData();
    var self = this;
    cardData.forEach(function(data, i) { self._createCard(data, i); });

    // Events
    window.addEventListener('wheel',     this._onWheel,     { passive: true });
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('click',     this._onClick);
    window.addEventListener('resize',    this._onResize);

    this.animationRunning = true;
    this.renderer.setAnimationLoop(this._animate);

    this._loadAvailableTags();
    this._initSearchBar();
  }

  /* ── Card data: ALL images from the Cloudinary library ──────── */
  /* The discover carousel shows the full portfolio.
   * Images with tags → click opens that tag's gallery.
   * Images without tags yet → still appear; visitor can scroll and appreciate them.
   * Falls back to featured + bnw manifests if the all-images API fails.           */
  async _buildCardData() {
    var baseDeck = [];

    // Primary: entire library via /api/all-images
    try {
      var res = await fetch('/api/all-images');
      var data = await res.json();
      (data.images || []).forEach(function(img) {
        var tags   = img.tags || [];
        var folder = img.folder || '';

        var categoryId, label, type;

        if (tags.length > 0) {
          // Tagged image → enter its most-popular tag gallery
          categoryId = tags[0];   // will be overwritten by best-tag selection below
          label      = tags.join(' · ');
          type       = 'tag';
        } else if (folder && folder !== 'info') {
          // Untagged image — use its actual Cloudinary folder as the gallery source
          // so clicking opens the right collection (e.g. 'bnw' → bnw gallery)
          categoryId = folder;
          label      = folder === 'bnw' ? 'Black & White'
                     : folder.charAt(0).toUpperCase() + folder.slice(1);
          type       = 'category';
        } else {
          // No tags AND no known folder — skip; can't route to a meaningful gallery
          return;
        }

        baseDeck.push({
          id:         img.public_id || '',
          categoryId: categoryId,
          label:      label,
          type:       type,
          thumbUrl:   img.secure_url || img.url || null,
          imgWidth:   img.width  || 800,
          imgHeight:  img.height || 600,
          tags:       tags,
          folder:     folder
        });
      });
    } catch (err) {
      console.error('[DiscoverCarousel] /api/all-images error:', err);
    }

    // Fallback: if all-images failed or returned nothing, use featured + bnw
    if (baseDeck.length === 0) {
      try {
        var r1 = await fetch('/api/manifests/featured');
        var d1 = await r1.json();
        (d1.images || []).forEach(function(img) {
          baseDeck.push({ id: img.public_id||'', categoryId:'featured', label:'Featured',
            type:'category', thumbUrl: img.secure_url||img.url||null,
            imgWidth: img.width||800, imgHeight: img.height||600, tags:[] });
        });
      } catch(_) {}
      try {
        var r2 = await fetch('/api/manifests/bnw');
        var d2 = await r2.json();
        (d2.images || []).forEach(function(img) {
          baseDeck.push({ id: img.public_id||'', categoryId:'bnw', label:'Black & White',
            type:'category', thumbUrl: img.secure_url||img.url||null,
            imgWidth: img.width||800, imgHeight: img.height||600, tags:[] });
        });
      } catch(_) {}
    }

    // Shuffle so the carousel doesn't always start with the same photos
    for (var i = baseDeck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = baseDeck[i]; baseDeck[i] = baseDeck[j]; baseDeck[j] = tmp;
    }

    // ── Best-tag selection: for multi-tagged images, use the tag with the most images ──
    // Build frequency map from all loaded images
    var tagCounts = {};
    baseDeck.forEach(function(card) {
      (card.tags || []).forEach(function(tag) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    // For each card with multiple tags, pick the most popular one as the gallery entry
    baseDeck.forEach(function(card) {
      if (card.tags && card.tags.length > 1) {
        var best = card.tags.reduce(function(a, b) {
          return (tagCounts[a] || 0) >= (tagCounts[b] || 0) ? a : b;
        });
        card.categoryId = best;
        card.label      = best;
        card.type       = 'tag';
      }
    });

    if (baseDeck.length === 0) {
      for (var k = 0; k < 12; k++) {
        baseDeck.push({ id:'ph'+k, categoryId:'featured', label:'Featured',
          type:'category', thumbUrl:null, imgWidth:800, imgHeight:600, tags:[] });
      }
    }

    return baseDeck;
  }

  /* ── Create a card mesh with the exact unveil.fr ShaderMaterial ────────── */
  _createCard(data, i) {
    // Geometry — unveil.fr formula
    var H = 1.5, W = 1.5;
    var be = (data.imgHeight && data.imgWidth) ? (data.imgHeight / data.imgWidth) : 1;
    W *= be;
    if (be) {
      var fe = 1 - (be - 1) * 0.5;
      H *= fe;
      W *= fe;
    }

    var geo = new THREE.PlaneGeometry(H, W);

    // ShaderMaterial using the exact unveil.fr vertex + fragment shaders
    var mat = new THREE.ShaderMaterial({
      vertexShader:   VERT_SHADER,
      fragmentShader: FRAG_SHADER,
      uniforms: {
        uImageTexture: { value: null },
        uBlurTexture:  { value: null },
        uMeshSize:     { value: new THREE.Vector2(H, W) },
        uImageSize:    { value: new THREE.Vector2(data.imgWidth || 800, data.imgHeight || 600) },
        uSaturation:   { value: 1.0 },
        uOpacity:      { value: 1.0 }
      },
      transparent: true,
      depthWrite:  false
    });

    if (data.thumbUrl) {
      var loader = new THREE.TextureLoader();

      // Sharp image texture
      loader.load(data.thumbUrl, function(tex) {
        mat.uniforms.uImageTexture.value = tex;
        if (!mat.uniforms.uBlurTexture.value) {
          mat.uniforms.uBlurTexture.value = tex; // use sharp as fallback until blur loads
        }
      });

      // Blurred version via Cloudinary — supplies the soft glass-like edge blend
      var blurUrl = data.thumbUrl.replace('/image/upload/', '/image/upload/e_blur:800,w_300,q_30,f_auto/');
      loader.load(blurUrl, function(tex) {
        mat.uniforms.uBlurTexture.value = tex;
      });
    }

    var mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = -Math.PI / 6;
    mesh.rotation.x = 0;
    mesh.rotation.z = 0;

    // ── Invisible hitbox — exact unveil.fr pattern ──────────────
    // Separate from the visual mesh so it never moves on hover.
    // scale.x = 1.5 makes it 50% wider — forgiving hit area that
    // prevents left/right edge flicker (verified from unveil.fr source).
    var hitboxMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false
    });
    var hitbox = new THREE.Mesh(geo, hitboxMat);
    hitbox.rotation.y = -Math.PI / 6;
    hitbox.scale.x = 1.5;          // 50% wider than visual card
    hitbox.userData.cardIndex = i;  // raycaster uses this to identify the card

    this.scene.add(mesh);
    this.scene.add(hitbox);

    // No separate glass overlay — blur-vignette blend in shader provides the glass look
    this.cards.push({ mesh: mesh, hitbox: hitbox, data: data, hovered: false, hoverT: 0 });
    this.cardMeshes.push(hitbox);   // only hitboxes in cardMeshes — they never move
    this.visuals.push(mesh);        // visual meshes are separate
  }

  /* ── Animation loop ─────────────────────────────────────────── */
  _animateFrame() {
    if (!this.animationRunning) return;

    // Smooth scroll — lerp at 0.10 toward target (matches virtualscroll feel)
    this.scrollPos += (this.targetScrollPos - this.scrollPos) * 0.10;

    var aspect = window.innerWidth / window.innerHeight;
    var N = this.cards.length;
    var G = 0.375;
    var F = N * G / 2;

    for (var i = 0; i < this.cards.length; i++) {
      var card = this.cards[i];

      var fe = i - this.scrollPos;
      var x  = gWrap(-F, F, fe * G);
      var z  = aspect < 1 ? -x * 6 : -x * aspect * 1.5;
      var isVisible = (z < 12.5 && z > -12.5);

      // ── Hitbox: always at base position, never moves ─────────────
      // This is the raycasting target. Because it stays static,
      // the hover state never oscillates when the visual mesh pops out.
      card.hitbox.position.set(x, 0, z);
      card.hitbox.visible = isVisible;

      // ── Hover spring ──────────────────────────────────────────────
      var hoverTarget = card.hovered ? 1 : 0;
      card.hoverT += (hoverTarget - card.hoverT) * 0.10;

      // ── Visual mesh: moves on hover (unveil.fr w.position pattern) ─
      card.mesh.position.set(x + card.hoverT * 0.325, card.hoverT * -0.10, z);
      card.mesh.visible = isVisible;

      // ── Distance-based opacity fade ───────────────────────────────
      var visRange    = 12.5 / Math.max(aspect * 1.5, 0.001);
      var normX       = Math.abs(x) / Math.max(visRange, 0.001);
      var distOpacity = Math.max(0.05, 1.0 - normX * normX * 0.95);

      if (card.mesh.material.uniforms) {
        card.mesh.material.uniforms.uOpacity.value = isVisible ? distOpacity : 0;
      }
    }

    // ── Raycast against hitboxes (static, never move) ─────────────
    if (this.raycaster && this.mouseNDC) {
      this.raycaster.setFromCamera(this.mouseNDC, this.camera);
      var visibleHitboxes = [];
      for (var vi = 0; vi < this.cardMeshes.length; vi++) {
        if (this.cardMeshes[vi].visible) visibleHitboxes.push(this.cardMeshes[vi]);
      }
      var hits = this.raycaster.intersectObjects(visibleHitboxes);

      for (var ri = 0; ri < this.cards.length; ri++) this.cards[ri].hovered = false;
      this.hoveredCard = null;

      if (hits.length > 0) {
        var hitIdx = hits[0].object.userData.cardIndex;
        if (hitIdx !== undefined && this.cards[hitIdx]) {
          this.cards[hitIdx].hovered = true;
          this.hoveredCard = this.cards[hitIdx];
        }
      }
      this.canvas.style.cursor = this.hoveredCard ? 'pointer' : 'default';
    }

    // No scene-position parallax
    this.renderer.render(this.scene, this.camera);
    this._updateLabelPosition();
  }

  _updateLabelPosition() {
    if (!this.hoveredCard || !this.hoveredCard.mesh.visible) {
      if (this.labelEl) this.labelEl.style.display = 'none';
      return;
    }
    var CARD_H = 1.5;
    var cardPos = this.hoveredCard.mesh.position;
    var bottomCenter = new THREE.Vector3(cardPos.x, cardPos.y - CARD_H/2, cardPos.z);
    bottomCenter.project(this.camera);
    var sx = (bottomCenter.x + 1) / 2 * this.canvas.clientWidth;
    var sy = (1 - bottomCenter.y) / 2 * this.canvas.clientHeight + 10;
    if (this.labelEl) {
      this.labelEl.style.left    = sx + 'px';
      this.labelEl.style.top     = sy + 'px';
      this.labelEl.style.display = 'block';
      this.labelEl.textContent   = this.hoveredCard.data.label;
    }
  }

  /* ── Scroll — deltaY/25 matches unveil.fr virtualScroll speed ── */
  _handleWheel(e) {
    this.targetScrollPos += e.deltaY / 25;
  }

  /* ── Mouse / click ───────────────────────────────────────────── */
  /* ── Mouse move — only updates NDC coords; raycasting is in animateFrame ── */
  _handleMouseMove(e) {
    if (!this.mouseNDC) return;
    var rect = this.canvas.getBoundingClientRect();
    this.mouseNDC.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this.mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  }

  _handleClick() {
    // Guard: carousel's window.click listener stays registered even when paused.
    // If gallery is open, animationRunning=false → ignore this click entirely.
    if (!this.animationRunning) return;
    if (!this.hoveredCard) return;
    var data = this.hoveredCard.data;
    if (this.onEnterGallery) this.onEnterGallery(data.categoryId, data.label, data.type, data.id);
  }

  /* ── Resize — adjust camera Z for portrait/landscape ─────────── */
  _handleResize() {
    if (!this.renderer || !this.camera) return;
    var w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.camera.position.set(0, 100/7.5, w < h ? 55 : 35);
    this.camera.lookAt(0, 0, 0);
  }

  /* ── Search bar ──────────────────────────────────────────────── */
  async _loadAvailableTags() {
    try {
      var res = await fetch('/api/available-tags');
      var data = await res.json();
      this.availableTags = data.tags || [];
      this._renderPills(this.availableTags);
    } catch(_) { this.availableTags = []; }
  }

  _renderPills(tags) {
    if (!this.pillsEl) return;
    while (this.pillsEl.firstChild) this.pillsEl.removeChild(this.pillsEl.firstChild);
    var self = this;
    tags.forEach(function(tag) {
      var btn = document.createElement('button');
      btn.className = 'tag-pill'; btn.type = 'button';
      btn.textContent = tag;
      btn.addEventListener('click', function() {
        if (self.onEnterGallery) self.onEnterGallery(tag, tag, 'tag');
      });
      self.pillsEl.appendChild(btn);
    });
  }

  _initSearchBar() {
    if (!this.searchEl) return;
    var self = this;
    var cursorEl = document.getElementById('discover-search-cursor');

    this.searchEl.addEventListener('focus', function() { if (cursorEl) cursorEl.style.display = 'none'; });
    this.searchEl.addEventListener('blur',  function() { if (cursorEl) cursorEl.style.display = ''; });

    this.searchEl.addEventListener('input', function() {
      var q = self.searchEl.value.toLowerCase().trim();
      if (!self.pillsEl) return;
      var pills = self.pillsEl.querySelectorAll('.tag-pill');
      for (var i = 0; i < pills.length; i++) {
        var m = !q || pills[i].textContent.toLowerCase().indexOf(q) !== -1;
        pills[i].classList.toggle('tag-pill--match',  !!q && m);
        pills[i].classList.toggle('tag-pill--dimmed', !!q && !m);
      }
    });

    this.searchEl.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var q = self.searchEl.value.trim();
      if (!q) return;
      var lq = q.toLowerCase();
      var match = null;
      for (var i = 0; i < self.availableTags.length; i++) {
        if (self.availableTags[i].toLowerCase().indexOf(lq) !== -1) { match = self.availableTags[i]; break; }
      }
      if (self.onEnterGallery) self.onEnterGallery(match||q, match||q, 'tag');
    });
  }

  pause()  { this.animationRunning = false; if (this.renderer) this.renderer.setAnimationLoop(null); }
  resume() { this.animationRunning = true;  if (this.renderer) this.renderer.setAnimationLoop(this._animate); }

  destroy() {
    this.pause();
    window.removeEventListener('wheel',     this._onWheel);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('click',     this._onClick);
    window.removeEventListener('resize',    this._onResize);
    if (this.renderer) this.renderer.dispose();
  }
}


/* ════════════════════════════════════════════════════════════════
   State wiring
   ════════════════════════════════════════════════════════════════ */

(function initDiscover() {
  var carouselEl = document.getElementById('discover-carousel');
  var galleryEl  = document.getElementById('discover-gallery');
  var backTopBtn = document.getElementById('gallery-back');
  var backBotBtn = document.getElementById('gallery-back-bottom');

  var gallery  = new DiscoverGallery();
  var carousel = new DiscoverCarousel(enterGallery);

  function enterGallery(sourceId, label, sourceType, clickedImageId) {
    sourceType = sourceType || 'category';
    carousel.pause();
    carousel.hoveredCard = null;  // clear stale hover — prevents bubbled click re-opening gallery
    carouselEl.style.display = 'none';

    // Hide the site nav from the carousel page
    var mainNav = document.querySelector('.discover-menu-bar');
    if (mainNav) mainNav.style.display = 'none';

    // Mark body so virtual-scroll height is active
    document.body.classList.add('gallery-is-open');

    galleryEl.style.display = 'block';

    // Wire tag-click navigation
    gallery._onTagClick = function(tag) {
      if (tag === gallery.activeTag) return;
      gallery.destroy();
      enterGallery(tag, tag, 'tag', null);
    };

    gallery.load(sourceId, sourceType, sourceId, clickedImageId || null);
  }

  function exitGallery() {
    gallery.destroy();
    galleryEl.style.display = 'none';
    document.body.classList.remove('gallery-is-open');

    var mainNav = document.querySelector('.discover-menu-bar');
    if (mainNav) mainNav.style.display = '';

    carouselEl.style.display = 'block';
    carousel.resume();
  }

  if (backTopBtn) backTopBtn.addEventListener('click', function(e) {
    e.stopPropagation();  // prevent bubble → window → carousel _handleClick
    exitGallery();
  });

  if (backBotBtn) backBotBtn.addEventListener('click', function(e) {
    e.stopPropagation();  // same: prevent stale carousel hover from re-opening gallery

    // Context-aware Back:
    //   INDEX grid open → close grid, return to single-image filmstrip
    //   Filmstrip view  → close gallery, return to Discover carousel
    if (document.body.classList.contains('gallery-index--open')) {
      gallery.toggleIndex();
    } else {
      exitGallery();
    }
  });

  carousel.init().catch(function(err) {
    console.error('[DiscoverCarousel] init failed:', err);
  });

  window._discoverGallery  = gallery;
  window._discoverCarousel = carousel;
}());
