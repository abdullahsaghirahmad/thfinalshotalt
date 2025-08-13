import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

export async function getImages(section: string) {
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .eq('section', section)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as Image[];
}

export async function getSection(name: string) {
  const { data, error } = await supabase
    .from('sections')
    .select('*')
    .eq('name', name)
    .single();

  if (error) throw error;
  return data as Section;
}