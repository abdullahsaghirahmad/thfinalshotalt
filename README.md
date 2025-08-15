# The Final Shot

A minimalist portfolio website that renders images based on cursor movement.

## Features

- Images appear based on cursor movement
- Threshold controller to adjust cursor sensitivity
- Image counter to track viewing progress
- Multiple category support (Featured, Europe, Himalayas, Info)
- Maximum of 10 images visible at once

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```

3. Open your browser to `http://localhost:3000`

## Supabase Integration

The site is configured to work with Supabase for image storage. To use this:

1. Obtain your Supabase anon key
2. Update the `SUPABASE_KEY` variable in `script.js`
3. Ensure your Supabase database has an 'images' table with the following schema:
   - id: number (primary key)
   - category: string (e.g., 'featured', 'europe', 'himalayas', 'info')
   - url: string (image URL)
   - content: string (optional, for text content)

If Supabase is not configured, the site will use fallback placeholder images from Unsplash.

## Usage

- Move your cursor to render images
- Click menu items to switch categories
- Use threshold controls to adjust cursor sensitivity:
  - Lower threshold (minimum 20): Images appear with smaller cursor movements
  - Higher threshold (maximum 200): Images require larger cursor movements

## Reference

This project is inspired by [bridget.pictures](https://bridget.pictures/)


