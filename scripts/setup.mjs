import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Sample images for testing
const sampleImages = [
  {
    section: 'featured',
    path: 'https://source.unsplash.com/random/1000x1000?minimal',
    metadata: {
      width: 1000,
      height: 1000,
      size: 500000,
      threshold: 80
    }
  },
  {
    section: 'digital',
    path: 'https://source.unsplash.com/random/1000x1000?architecture',
    metadata: {
      width: 1000,
      height: 1000,
      size: 500000,
      threshold: 80
    }
  },
  {
    section: 'film',
    path: 'https://source.unsplash.com/random/1000x1000?portrait',
    metadata: {
      width: 1000,
      height: 1000,
      size: 500000,
      threshold: 80
    }
  }
];

async function setupSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Read and execute schema
  const schemaPath = join(__dirname, '..', 'supabase', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  
  try {
    // Execute schema
    const { error: schemaError } = await supabase.rpc('exec_sql', { sql: schema });
    if (schemaError) throw schemaError;
    console.log('✓ Schema created successfully');

    // Insert sample images
    for (const image of sampleImages) {
      const { error: imageError } = await supabase
        .from('images')
        .insert([image]);
      if (imageError) throw imageError;
    }
    console.log('✓ Sample images inserted successfully');

  } catch (error) {
    console.error('Error setting up Supabase:', error);
    process.exit(1);
  }
}

setupSupabase();
