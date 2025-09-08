# The Final Shot - Interactive Photography Portfolio

> **What happens when you let users choreograph your visual narrative?**

An experimental web application that transforms passive image browsing into an interactive performance, where cursor movement reveals photography in real-time. Built to explore the intersection of user experience design, technical implementation, and artistic expression.

![Portfolio in action](https://github.com/abdullahsaghirahmad/thfinalshotalt/blob/main/heroAlt.gif)

## 🎯 Product Vision

As a photographer and product manager fascinated by user interaction patterns, I wanted to challenge the traditional grid-based portfolio format. This project explores:

- **User Agency**: How can we make viewers active participants rather than passive consumers?
- **Progressive Disclosure**: Using cursor proximity as a natural information hierarchy
- **Performance Psychology**: The satisfaction of "discovering" vs. being "shown" content

## Technical Architecture

### Core Technologies
- **Next.js 14** with App Router for modern React architecture
- **TypeScript** for type safety and developer experience  
- **Zustand** for predictable state management
- **Cloudinary** for optimized image delivery with transformation API
- **Supabase** as backup data layer
- **Custom CSS** animations for 60fps interactions

### Key Engineering Decisions

**1. Cursor-Based Revelation System**
```typescript
// Dynamic threshold-based image rendering with performance optimization
const ImageCard = ({ image, isActive, threshold }) => (
  <Image
    src={`${image.path}?tr=th-${threshold}`}
    className="transition-all duration-300"
    priority={isActive}
  />
);
```

**2. Cross-Platform Performance**
- Device capability detection for adaptive rendering
- Mobile vs desktop interaction patterns
- Hardware acceleration via `requestAnimationFrame`

**3. Graceful Degradation**
```typescript
// Multi-tier fallback system
try {
  const cloudinaryImages = await getCloudinaryImages('featured');
  if (cloudinaryImages?.length) return mapToSupabaseFormat(cloudinaryImages);
  
  const supabaseImages = await getImages('featured');
  return supabaseImages;
} catch {
  return fallbackImages; // Always functional
}
```

## Product Features

### User Experience Innovations
- **Adaptive Sensitivity**: User-controlled threshold for personalized interaction
- **Progressive Loading**: Maximum # of images visible simultaneously based on threshold for optimal performance  
- **Category-Based Navigation**: Organized content discovery

## Performance Metrics
- **Lighthouse Score**: 95+ on performance
- **First Contentful Paint**: <0.5s
- **Cross-browser compatibility**: Chrome, Safari, Firefox, Edge


## 🔗 Live Demo
[Experience the interactive portfolio](https://thefinalshotalt.vercel.app/)

---

*Made with the heart of an artist and the passion of a product manager.*