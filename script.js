// Import image utilities 
// Note: For browser compatibility, we'll include these files via script tags in the HTML
// and access them through the global scope, but here's how we'd reference them
// const { getImageUrl, preloadImage, preloadImages } = imageUtils;

document.addEventListener('DOMContentLoaded', () => {
    // Cloudinary will be our primary image provider
    // This utility is loaded from cloudinary-browser.js
    const useCloudinary = typeof imageUtils !== 'undefined';
    
    // Supabase can be used as a fallback or for other data
    const SUPABASE_URL = 'https://vwqbsxbkgfhtagxeprzp.supabase.co';
    const SUPABASE_KEY = ''; // This should be a public anon key - would need to be provided
    
    // Initialize Supabase client
    let supabaseClient = null;
    // Don't try to initialize Supabase if the library isn't available
    try {
        if (SUPABASE_KEY && typeof supabase !== 'undefined') {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
    } catch (error) {
        console.error('Error initializing Supabase client:', error);
        // Will proceed with Cloudinary or local fallback images for demo
    }

    // Detect if we're on a mobile device
    const isMobileDevice = detectMobileDevice();
    
    // State variables
    let imagesData = {}; // Will hold all images by category
    let currentCategory = 'featured';
    let threshold = isMobileDevice ? 60 : 80; // Lower threshold for mobile devices
    let lastCursorPosition = { x: 0, y: 0 };
    let imagesRendered = 0;
    let totalImages = 0;
    let renderedElements = [];
    let MAX_VISIBLE_IMAGES = 10; // Now dynamic based on threshold
    let firstMovementDone = false;
    
    // Touch handling state variables
    let touchStartX = null;
    let touchStartY = null;
    let touchStartTime = null;
    let isSwiping = false;
    let isHolding = false;
    let lastMoveTime = null;
    
    // State preservation for focus mode
    let savedState = {
        imagesRendered: 0,
        renderedElements: [],
        renderedElementsData: [], // Store positions and URLs
        lastCursorPosition: { x: 0, y: 0 }
    };
    
    // Calculate max visible images based on threshold
    // When threshold is 20 (min), show 10 images
    // When threshold is 200 (max), show 5 images
    function calculateMaxVisibleImages() {
        // Linear interpolation between 10 images at threshold 20 and 5 images at threshold 200
        return Math.round(10 - ((threshold - 20) / (200 - 20)) * 5);
    }
    
    // DOM Elements
    const container = document.getElementById('container');
    const imagesContainer = document.getElementById('images-container');
    const menuItems = document.querySelectorAll('.menu-item');
    const thresholdValue = document.getElementById('threshold-value');
    const thresholdDecrease = document.getElementById('threshold-decrease');
    const thresholdIncrease = document.getElementById('threshold-increase');
    const counter = document.getElementById('counter');
    const focusedView = document.getElementById('focused-view');
    const focusedImage = document.getElementById('focused-image');
    const cursorLabel = document.getElementById('cursor-label');
    
    // Additional state variables
    let isFocusedMode = false;
    let focusedImageIndex = -1;
    let cursorPosition = 'center'; // 'left', 'center', or 'right'
    
    // Use actual Cloudinary images - no more mock images
    console.log('Using Cloudinary for image delivery');
    // Use all available images from the Cloudinary folder, no hardcoded limit
    
    // Initialize empty image data structure - we'll load only what we need
    const cloudinaryImages = {
        'featured': [],
        'europe': [],
        'himalayas': [],
        'info': [{ 
            id: 1, 
            url: '', 
            content: `<div class="info-content">
                <h1>Abdullah Ahmad</h1>
                <p>Abdullah is a self-taught storyteller from India who uses frames, films, and fiction to tell stories that deliver a feeling. His north star is to introduce people to hitherto unexperienced horizons of beauty. To inspire them to be more, to do more. To be the versions of themselves that they are low-key happy about on the inside.</p>
                <p>His work has been viewed millions of times on various social media platforms, magazines, online publications, film festivals, and on the cover of a book. He constantly works towards creating something that delivers a feeling.</p>
                <div class="contact-links">
                    <a href="mailto:contact@thefinalshot.com" target="_blank">Email ↗</a>
                    <a href="https://instagram.com/thefinalshot" target="_blank">Instagram ↗</a>
                </div>
                <div class="copyright">
                    © ${new Date().getFullYear()} The Final Shot. All rights reserved.
                </div>
            </div>` 
        }]
    };
    
    // Initialize the page
    init();
    
    // Focus image functionality
    function focusImage(imageElement) {
        // Safety check - ensure we have a valid element with dataset
        if (!imageElement || !imageElement.dataset) {
            console.error('Invalid image element for focus mode');
            return;
        }
        // Save complete current state before entering focus mode
        savedState = {
            imagesRendered: imagesRendered,
            renderedElements: [...renderedElements], // Clone the array
            renderedElementsData: renderedElements.map(el => {
                // Safely handle elements without dataset properties
                if (!el.dataset) {
                    return {
                        index: 0,
                        url: '',
                        position: { top: '0px', left: '0px' }
                    };
                }
                return ({
                index: el.dataset.index ? parseInt(el.dataset.index) : 0,
                url: el.dataset.url || '',
                position: {
                    top: el.style.top || '0px',
                    left: el.style.left || '0px'
                }
            });
            }),
            lastCursorPosition: {...lastCursorPosition}
        };
        
        console.log('Entering focus mode. Saved state:', 
                  'Image index:', parseInt(imageElement.dataset.index),
                  'Images rendered:', savedState.imagesRendered,
                  'Elements:', savedState.renderedElements.length);
        
        // Set focus mode state
        isFocusedMode = true;
        focusedImageIndex = parseInt(imageElement.dataset.index);
        
        // Important: Synchronize the global counter with focused index immediately
        // Add 1 because imagesRendered is 1-based (we increment after rendering)
        // but dataset.index is 0-based (the current rendered count)
        imagesRendered = focusedImageIndex + 1;
        
        // Set the focused image source - use the same URL as the normal view
        focusedImage.src = imageElement.dataset.url;
        
        // Update counter display to match the focused image
        updateCounter();
        
        // Show the focused view
        focusedView.classList.add('active');
        container.classList.add('focused-mode');
        
        // Remove the appropriate event listeners based on device type
        if (isMobileDevice) {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            
            // Add touch-specific event listeners for focused view
            document.addEventListener('touchstart', handleFocusedTouchStart);
            document.addEventListener('touchmove', handleFocusedTouchMove);
            document.addEventListener('touchend', handleFocusedTouchEnd);
        } else {
            // Disable regular cursor move handler to prevent background image rendering
            container.removeEventListener('mousemove', handleCursorMove);
            
            // Setup mouse event listeners for focused mode
            document.addEventListener('mousemove', handleFocusedMouseMove);
            focusedView.addEventListener('click', handleFocusedClick);
        }
        
        // Add keyboard navigation for all devices
        document.addEventListener('keydown', handleKeyDown);
    }
    
    function renderMultipleImagesFromCurrent() {
        // Calculate the center position
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // Render the current image first (the hero image)
        renderImage(centerX, centerY);
        
        // Render additional images in a pattern around the center
        // We'll create a spiral-like pattern of images
        const numAdditional = Math.min(MAX_VISIBLE_IMAGES - 1, totalImages - 1);
        const radius = 200; // Base radius for the spiral
        const angleStep = (2 * Math.PI) / numAdditional;
        
        for (let i = 0; i < numAdditional; i++) {
            const angle = i * angleStep;
            const distance = radius * (1 + i * 0.1); // Increasing radius for spiral effect
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            
            // Only render if within visible bounds
            if (x > 0 && x < window.innerWidth && y > 0 && y < window.innerHeight - 50) {
                renderImage(x, y);
            }
        }
    }

    function closeFocusedView() {
        // Hide the focused view
        focusedView.classList.remove('active');
        container.classList.remove('focused-mode');
        
        console.log('Exiting focus mode. Restoring state:', 
                  'Saved images rendered:', savedState.imagesRendered,
                  'Current images rendered:', imagesRendered,
                  'Elements to restore:', savedState.renderedElements.length);
        
        // Clear existing images
        imagesContainer.innerHTML = '';
        renderedElements = [];
        
        // Remove focus mode event listeners based on device type
        if (isMobileDevice) {
            document.removeEventListener('touchstart', handleFocusedTouchStart);
            document.removeEventListener('touchmove', handleFocusedTouchMove);
            document.removeEventListener('touchend', handleFocusedTouchEnd);
        } else {
            document.removeEventListener('mousemove', handleFocusedMouseMove);
            focusedView.removeEventListener('click', handleFocusedClick);
        }
        
        // Remove keyboard navigation for all devices
        document.removeEventListener('keydown', handleKeyDown);
        
        // Hide cursor label
        cursorLabel.classList.remove('visible');
        
        // Restore the exact state from before focus mode
        restoreSavedState();
        
        // Reset focused mode state
        isFocusedMode = false;
        focusedImageIndex = -1;
        
        // Re-enable regular interaction handlers based on device type
        if (isMobileDevice) {
            container.addEventListener('touchstart', handleTouchStart);
            container.addEventListener('touchmove', handleTouchMove);
            container.addEventListener('touchend', handleTouchEnd);
        } else {
            container.addEventListener('mousemove', handleCursorMove);
        }
    }
    
    // Function to restore the exact state from before focus mode
    function restoreSavedState() {
        // Add defensive checks
        if (!savedState || !savedState.renderedElementsData || savedState.renderedElementsData.length === 0) {
            console.log('No saved state to restore, using default rendering');
            renderMultipleImagesFromCurrent();
            return;
        }
        
        // Restore the exact image counter
        // Ensure we're using the saved counter value, not the potentially modified one from focus mode
        imagesRendered = savedState.imagesRendered;
        
        // Restore the exact cursor position
        lastCursorPosition = {...savedState.lastCursorPosition};
        
        console.log('Restoring', savedState.renderedElementsData.length, 'images with counter at', imagesRendered);
        
        // Recreate each image element in its exact position
        savedState.renderedElementsData.forEach(data => {
            const imageData = imagesData[currentCategory][data.index];
            if (!imageData) return;
            
            // Create image element
            const imageElement = document.createElement('div');
            imageElement.className = 'image-item';
            
            if (imageData.url) {
                // If it's an actual image
                const img = document.createElement('img');
                img.src = imageData.url;
                img.loading = "lazy";
                
                // Position the image at its original position
                imageElement.style.top = data.position.top;
                imageElement.style.left = data.position.left;
                imageElement.style.transform = 'translate(-50%, -50%)';
                
                // Store image data for focused view
                imageElement.dataset.index = data.index;
                imageElement.dataset.url = imageData.url;
                
                // Add click event to focus this image
                imageElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    focusImage(imageElement);
                });
                
                imageElement.appendChild(img);
            } else if (imageData.content) {
                // If it's text content (for info)
                imageElement.innerHTML = imageData.content;
                imageElement.style.padding = '20px';
                imageElement.style.maxWidth = '600px';
            }
            
            // Add to container
            imagesContainer.appendChild(imageElement);
            
            // Add to tracked elements
            renderedElements.push(imageElement);
        });
        
        // Update counter to match the restored state
        updateCounter();
    }
    
    function handleFocusedMouseMove(e) {
        if (!isFocusedMode) return;
        
        const windowWidth = window.innerWidth;
        const x = e.clientX;
        
        // Determine cursor position
        let newPosition;
        if (x < windowWidth * 0.3) {
            newPosition = 'left';
            cursorLabel.textContent = 'Prev';
            cursorLabel.style.left = `${e.clientX}px`;
        } else if (x > windowWidth * 0.7) {
            newPosition = 'right';
            cursorLabel.textContent = 'Next';
            cursorLabel.style.left = `${e.clientX}px`;
        } else {
            newPosition = 'center';
            cursorLabel.textContent = 'Close';
            cursorLabel.style.left = `${e.clientX}px`;
        }
        
        // Update cursor position if changed
        if (newPosition !== cursorPosition) {
            cursorPosition = newPosition;
        }
        
        // Position vertically above cursor
        cursorLabel.style.top = `${e.clientY - 20}px`;
        cursorLabel.classList.add('visible');
    }
    
    function handleFocusedClick(e) {
        if (!isFocusedMode) return;
        
        // Determine action based on cursor position
        if (cursorPosition === 'left') {
            showPrevImage();
        } else if (cursorPosition === 'right') {
            showNextImage();
        } else {
            closeFocusedView();
        }
    }
    
    function showPrevImage() {
        if (!isFocusedMode || focusedImageIndex <= 0) return;
        
        // Update indices and ensure they remain in sync
        focusedImageIndex = Math.max(0, focusedImageIndex - 1);
        imagesRendered = focusedImageIndex + 1; // Ensure exact synchronization (add 1 for 1-based counter)
        
        console.log('Previous image:', 
                  'New focused index:', focusedImageIndex, 
                  'Images rendered:', imagesRendered);
        
        // Safety check - ensure the category and index are valid
        if (!imagesData[currentCategory] || !imagesData[currentCategory][focusedImageIndex]) {
            console.error('Invalid image data for previous image');
            return;
        }
        
        const prevImage = imagesData[currentCategory][focusedImageIndex];
        if (prevImage) {
            // Use the standard URL for immediate appearance
            focusedImage.src = prevImage.url;
            
            // Force counter update to ensure UI consistency
            updateCounter();
        }
    }
    
    function showNextImage() {
        if (!isFocusedMode || focusedImageIndex >= totalImages - 1) return;
        
        // Update indices and ensure they remain in sync
        focusedImageIndex = Math.min(totalImages - 1, focusedImageIndex + 1);
        imagesRendered = focusedImageIndex + 1; // Ensure exact synchronization (add 1 for 1-based counter)
        
        console.log('Next image:', 
                  'New focused index:', focusedImageIndex, 
                  'Images rendered:', imagesRendered);
        
        // Safety check - ensure the category and index are valid
        if (!imagesData[currentCategory] || !imagesData[currentCategory][focusedImageIndex]) {
            console.error('Invalid image data for next image');
            return;
        }
        
        const nextImage = imagesData[currentCategory][focusedImageIndex];
        if (nextImage) {
            // Use the standard URL for immediate appearance
            focusedImage.src = nextImage.url;
            
            // Force counter update to ensure UI consistency
            updateCounter();
        }
    }
    
    function handleKeyDown(e) {
        if (!isFocusedMode) return;
        
        // Handle arrow keys and escape
        switch (e.key) {
            case 'ArrowLeft':
                showPrevImage();
                break;
            case 'ArrowRight':
                showNextImage();
                break;
            case 'Escape':
                closeFocusedView();
                break;
        }
    }
    
    // Detect if we're on a mobile device
    function detectMobileDevice() {
        const isMobile = (window.innerWidth <= 767) || 
                         ('ontouchstart' in window) || 
                         (navigator.maxTouchPoints > 0);
        
        // Log detection results for testing
        console.log('Device detection:', {
            width: window.innerWidth,
            hasTouch: 'ontouchstart' in window,
            touchPoints: navigator.maxTouchPoints,
            isMobile: isMobile
        });
        
        return isMobile;
    }
    
    async function init() {
        // Initialize MAX_VISIBLE_IMAGES based on starting threshold
        MAX_VISIBLE_IMAGES = calculateMaxVisibleImages();
        console.log(`Initial threshold: ${threshold}, Max visible images: ${MAX_VISIBLE_IMAGES}`);
        
        // Initialize UI
        updateThresholdDisplay();
        updateCounter();
        
        // Start loading images for current category
        loadImages(currentCategory);
        
        // Set up appropriate event listeners based on device type
        if (isMobileDevice) {
            console.log('Mobile device detected, setting up touch handlers');
            // Touch event listeners for mobile devices
            container.addEventListener('touchstart', handleTouchStart);
            container.addEventListener('touchmove', handleTouchMove);
            container.addEventListener('touchend', handleTouchEnd);
            
            // Add swipe indicator for first-time users
            showSwipeIndicator();
        } else {
            console.log('Desktop device detected, using mouse handlers');
            // Mouse event listener for desktop
            container.addEventListener('mousemove', handleCursorMove);
        }
        
        // Listen for image loading completion
        window.addEventListener('imagesLoaded', (event) => {
            if (event.detail && event.detail.category === currentCategory) {
                console.log(`Images loaded for current category: ${currentCategory}`);
                // Images are loaded but won't be displayed until cursor moves
                // This preserves the original behavior where the first image appears only after cursor movement
            }
        });
        
        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                const category = item.dataset.category;
                switchCategory(category);
            });
        });
        
        thresholdDecrease.addEventListener('click', () => adjustThreshold(-20));
        thresholdIncrease.addEventListener('click', () => adjustThreshold(20));
    }
    
    // Function to refresh the current category display with new images
    function refreshCurrentCategory() {
        // Clear existing images
        imagesContainer.innerHTML = '';
        renderedElements = [];
        
        // Reset counter
        imagesRendered = 0;
        firstMovementDone = false;
        
        // Load images for this category with fresh data from Cloudinary
        delete imagesData[currentCategory]; // Force reload from Cloudinary
        loadImages(currentCategory);
        
        // Update counter
        updateCounter();
    }
    
    async function loadImages(category) {
        // If images are already loaded for this category, use them
        if (imagesData[category] && imagesData[category].length > 0) {
            totalImages = imagesData[category].length;
            updateCounter();
            return;
        }
        
        try {
            console.log(`Loading images for category: ${category}`);
            
            // Use our new async function to get images for this category only
            // Pass 0 to indicate we want all available images
            const images = await imageUtils.getImagesForCategory(category, 0);
            
            if (images && images.length > 0) {
                // Store in our local data
                imagesData[category] = images;
                totalImages = images.length;
                console.log(`Loaded ${images.length} images for ${category}`);
            } else {
                // Create guaranteed fallback images
                console.warn(`No images found for ${category}, using fallback images`);
                const fallbackImages = createFallbackImages(category, imageCount);
                imagesData[category] = fallbackImages;
                totalImages = fallbackImages.length;
            }
            
            // Update the counter
            updateCounter();
        } catch (error) {
            console.error('Error loading images:', error);
            // Even on error, provide fallback images
            const fallbackImages = createFallbackImages(category, imageCount);
            imagesData[category] = fallbackImages;
            totalImages = fallbackImages.length;
            updateCounter();
        }
    }
    
    // Helper function to create fallback images that will always work
    function createFallbackImages(category, count) {
        console.log(`Creating ${count} fallback images for ${category}`);
        
        // These URLs are guaranteed to work
        const knownUrls = [
            'https://res.cloudinary.com/dess344fq/image/upload/v1755175923/abdullah-ahmad-SLBjcE5IQxo-unsplash_xb4ash.jpg',
            'https://res.cloudinary.com/dess344fq/image/upload/v1755175923/abdullah-ahmad-V5Osd0LKiLQ-unsplash_ugngol.jpg'
        ];
        
        const images = [];
        for (let i = 0; i < count; i++) {
            images.push({
                id: i + 1,
                publicId: `fallback-${i}`,
                url: knownUrls[i % knownUrls.length],
                alt: `${category} image ${i + 1}`
            });
        }
        
        return images;
    }
    
    function handleCursorMove(e) {
        const cursorX = e.clientX;
        const cursorY = e.clientY;
        
        // Calculate distance moved
        const distance = calculateDistance(lastCursorPosition.x, lastCursorPosition.y, cursorX, cursorY);
        
        // If this is the first movement or the distance exceeds the threshold
        if (!firstMovementDone || distance >= threshold) {
            renderImage(cursorX, cursorY);
            
            // Update last position
            lastCursorPosition = { x: cursorX, y: cursorY };
            
            // Mark first movement as done
            if (!firstMovementDone) {
                firstMovementDone = true;
            }
        }
    }
    
    function calculateDistance(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }
    
    function renderImage(x, y) {
        // Get next image to render
        if (imagesRendered >= totalImages) {
            // We've shown all images, restart
            imagesRendered = 0;
        }
        
        // Safety check - ensure the category and index are valid
        if (!imagesData[currentCategory] || !imagesData[currentCategory][imagesRendered]) {
            console.error('Invalid image data for rendering');
            return;
        }
        
        const imageData = imagesData[currentCategory][imagesRendered];
        
        if (!imageData) return;
        
        // Create image element
        const imageElement = document.createElement('div');
        imageElement.className = 'image-item';
        
        if (imageData.url) {
            // If it's an actual image
            const img = document.createElement('img');
            
            // Use the standard URL for all views for immediate appearance
            img.src = imageData.url;
            
            // Add loading="lazy" for better performance
            img.loading = "lazy";
            
            // Position the image relative to cursor
            imageElement.style.top = `${y}px`;
            imageElement.style.left = `${x}px`;
            imageElement.style.transform = 'translate(-50%, -50%)';
            
            // Store image data for focused view
            imageElement.dataset.index = imagesRendered;
            imageElement.dataset.url = imageData.url;
            
            // Add click event to focus this image
            imageElement.addEventListener('click', (e) => {
                e.stopPropagation();
                focusImage(imageElement);
            });
            
            imageElement.appendChild(img);
        } else if (imageData.content) {
            // If it's text content (for info)
            imageElement.innerHTML = imageData.content;
            imageElement.style.position = 'relative';
            imageElement.style.transform = 'none';
            imageElement.style.top = '0';
            imageElement.style.left = '0';
            imageElement.style.width = '100%';
            imageElement.style.maxWidth = '100%';
            // Center it in the viewport
            imageElement.style.margin = '0 auto';
        }
        
        // Add to container
        imagesContainer.appendChild(imageElement);
        
        // Add to tracked elements
        renderedElements.push(imageElement);
        
        // Remove oldest element if we've reached max visible images
        if (renderedElements.length > MAX_VISIBLE_IMAGES) {
            const oldestElement = renderedElements.shift();
            oldestElement.remove();
        }
        
        // Update counter
        imagesRendered++;
        updateCounter();
    }
    
    function switchCategory(category) {
        // Don't do anything if it's the same category
        if (category === currentCategory) return;
        
        console.log(`Switching to category: ${category}`);
        
        // Update active menu item
        menuItems.forEach(item => {
            if (item.dataset.category === category) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Update current category
        currentCategory = category;
        
        // Clear existing images
        imagesContainer.innerHTML = '';
        renderedElements = [];
        
        // Reset counter
        imagesRendered = 0;
        firstMovementDone = false;
        
        // Special handling for info category
        if (category === 'info') {
            // For info category, redirect to the dedicated info page
            window.location.href = '/info';
            return;
        } else {
            // For image categories, load images and wait for mouse movement
            loadImages(category).then(() => {
                // Don't auto-render the first image, wait for mouse movement
                // This preserves the original behavior
            });
        }
    }
    
    function adjustThreshold(amount) {
        // Update threshold value
        threshold = Math.max(20, Math.min(200, threshold + amount));
        
        // Update MAX_VISIBLE_IMAGES based on new threshold
        MAX_VISIBLE_IMAGES = calculateMaxVisibleImages();
        console.log(`Threshold: ${threshold}, Max visible images: ${MAX_VISIBLE_IMAGES}`);
        
        // Update UI
        updateThresholdDisplay();
        
        // Adjust visible images if needed
        adjustVisibleImages();
    }
    
    function updateThresholdDisplay() {
        // Pad the threshold value to 4 digits
        thresholdValue.textContent = threshold.toString().padStart(4, '0');
    }
    
    // Adjust the number of visible images based on current MAX_VISIBLE_IMAGES
    function adjustVisibleImages() {
        // If we have more images than the new maximum, remove the oldest ones
        while (renderedElements.length > MAX_VISIBLE_IMAGES && renderedElements.length > 0) {
            const oldestElement = renderedElements.shift();
            oldestElement.remove();
        }
    }
    
    function updateCounter() {
        // Format: 0001 / 0041
        const current = imagesRendered.toString().padStart(4, '0');
        const total = totalImages.toString().padStart(4, '0');
        counter.textContent = `${current} / ${total}`;
        console.log('Counter updated:', current, '/', total);
    }
    
    // Touch event handlers for mobile devices
    function handleTouchStart(e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        isSwiping = false;
        isHolding = false;
        lastMoveTime = Date.now();
        
        // Start monitoring hold state
        if (isMobileDevice) {
            requestAnimationFrame(checkHoldState);
        }
    }
    
    function handleTouchMove(e) {
        if (!touchStartX || !touchStartY) return;
        
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const distance = calculateDistance(touchStartX, touchStartY, touchX, touchY);
        
        // If moved beyond a minimum threshold, consider it a swipe
        if (distance > 10) {
            isSwiping = true;
            lastMoveTime = Date.now();
            
            // If moving beyond our render threshold, render a new image
            if (distance >= threshold * 0.8) { // Slightly lower threshold for touch
                renderImage(touchX, touchY);
                
                // Update the reference point for future distance calculation
                touchStartX = touchX;
                touchStartY = touchY;
                
                if (!firstMovementDone) {
                    firstMovementDone = true;
                    
                    // Hide swipe indicator after first successful swipe
                    hideSwipeIndicator();
                }
            }
            
            // Detect if user is holding after a swipe (continuous movement)
            if (e.touches.length === 1) {
                isHolding = true;
            }
        }
        
        // Prevent scrolling when swiping inside container
        if (isSwiping) {
            e.preventDefault();
        }
    }
    
    function handleTouchEnd(e) {
        // Check if it was a tap (quick touch with minimal movement)
        const touchEndTime = Date.now();
        const touchDuration = touchEndTime - touchStartTime;
        
        if (touchStartX !== null && touchStartY !== null) {
            const touchX = e.changedTouches[0].clientX;
            const touchY = e.changedTouches[0].clientY;
            const distance = calculateDistance(touchStartX, touchStartY, touchX, touchY);
            
            // If short duration and minimal movement, it's a tap
            if (touchDuration < 300 && distance < 10) {
                // Find if the tap is on an image
                const element = document.elementFromPoint(touchX, touchY);
                const imageElement = element?.closest('.image-item');
                
                if (imageElement) {
                    // Handle tap on image (open focused view)
                    focusImage(imageElement);
                } else if (!firstMovementDone) {
                    // If this is the first interaction and it's a tap in empty space,
                    // render the first image at the tap location
                    renderImage(touchX, touchY);
                    firstMovementDone = true;
                    
                    // Hide swipe indicator
                    hideSwipeIndicator();
                }
            }
        }
        
        // Reset touch tracking
        touchStartX = null;
        touchStartY = null;
        isSwiping = false;
        isHolding = false;
    }
    
    // Touch handlers for focused view
    function handleFocusedTouchStart(e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }
    
    function handleFocusedTouchMove(e) {
        if (!touchStartX) return;
        
        const touchX = e.touches[0].clientX;
        const diffX = touchX - touchStartX;
        const windowWidth = window.innerWidth;
        
        // Show visual indicator based on swipe direction
        if (diffX < -50) {
            cursorLabel.textContent = 'Next';
            cursorLabel.style.left = `${touchX}px`;
            cursorLabel.style.top = `${e.touches[0].clientY - 20}px`;
            cursorLabel.classList.add('visible');
        } else if (diffX > 50) {
            cursorLabel.textContent = 'Prev';
            cursorLabel.style.left = `${touchX}px`;
            cursorLabel.style.top = `${e.touches[0].clientY - 20}px`;
            cursorLabel.classList.add('visible');
        } else {
            cursorLabel.textContent = 'Close';
            cursorLabel.style.left = `${touchX}px`;
            cursorLabel.style.top = `${e.touches[0].clientY - 20}px`;
            cursorLabel.classList.add('visible');
        }
        
        // Prevent default to avoid browser navigation gestures
        e.preventDefault();
    }
    
    function handleFocusedTouchEnd(e) {
        if (!touchStartX) return;
        
        const touchEndTime = Date.now();
        const touchDuration = touchEndTime - touchStartTime;
        const touchX = e.changedTouches[0].clientX;
        const diffX = touchX - touchStartX;
        const distance = Math.abs(diffX);
        
        // Swipe gesture (significant horizontal movement)
        if (distance > 50) {
            if (diffX < 0) {
                showNextImage();
            } else {
                showPrevImage();
            }
        } 
        // Tap gesture (minimal movement, short duration)
        else if (distance < 10 && touchDuration < 300) {
            closeFocusedView();
        }
        
        touchStartX = null;
        cursorLabel.classList.remove('visible');
    }
    
    // Function to check if user is holding their finger in place
    function checkHoldState() {
        if (isHolding && lastMoveTime && Date.now() - lastMoveTime > 100) {
            // User is holding but not actively moving
            // We can pause rendering here
            
            // If holding continues for more than 500ms without movement, show indicator
            if (Date.now() - lastMoveTime > 500) {
                showHoldIndicator();
            }
        }
        
        // Continue checking while touching
        if (touchStartX !== null) {
            requestAnimationFrame(checkHoldState);
        } else {
            hideHoldIndicator();
        }
    }
    
    // Functions for showing/hiding mobile-specific UI elements
    function showSwipeIndicator() {
        // Create swipe indicator if it doesn't exist
        let swipeIndicator = document.getElementById('swipe-indicator');
        if (!swipeIndicator) {
            swipeIndicator = document.createElement('div');
            swipeIndicator.id = 'swipe-indicator';
            swipeIndicator.className = 'swipe-indicator';
            swipeIndicator.innerHTML = '<div class="swipe-icon">←→</div><div class="swipe-text">Swipe to explore</div>';
            container.appendChild(swipeIndicator);
        }
        swipeIndicator.classList.add('visible');
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            hideSwipeIndicator();
        }, 3000);
    }
    
    function hideSwipeIndicator() {
        const swipeIndicator = document.getElementById('swipe-indicator');
        if (swipeIndicator) {
            swipeIndicator.classList.remove('visible');
        }
    }
    
    function showHoldIndicator() {
        // Only show if we're still holding
        if (!isHolding || touchStartX === null) return;
        
        let holdIndicator = document.getElementById('hold-indicator');
        if (!holdIndicator) {
            holdIndicator = document.createElement('div');
            holdIndicator.id = 'hold-indicator';
            holdIndicator.className = 'hold-indicator';
            holdIndicator.innerHTML = '<div class="hold-text">Hold + move to continue</div>';
            container.appendChild(holdIndicator);
        }
        holdIndicator.classList.add('visible');
    }
    
    function hideHoldIndicator() {
        const holdIndicator = document.getElementById('hold-indicator');
        if (holdIndicator) {
            holdIndicator.classList.remove('visible');
        }
    }
});
