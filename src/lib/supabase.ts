import { createClient } from '@supabase/supabase-js';
import { cache } from 'react';

const createServerClient = cache(() => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
});

export interface Image {
  id: string;
  created_at: string;
  path: string;
  section: 'featured' | 'digital' | 'film';
  metadata: {
    width: number;
    height: number;
    size: number;
    threshold?: number;
  };
}

export interface Section {
  id: string;
  name: 'featured' | 'digital' | 'film';
  title: string;
  description?: string;
}

export async function getImages(section: string): Promise<Image[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .eq('section', section)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching images:', error);
    return [];
  }

  return data as Image[];
}

export async function getSection(name: string): Promise<Section | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sections')
    .select('*')
    .eq('name', name)
    .single();

  if (error) {
    console.error('Error fetching section:', error);
    return null;
  }

  return data as Section;
}