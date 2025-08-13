-- Create tables
CREATE TABLE sections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL CHECK (name IN ('featured', 'digital', 'film')),
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  section TEXT NOT NULL CHECK (section IN ('featured', 'digital', 'film')),
  path TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes
CREATE INDEX images_section_idx ON images(section);
CREATE INDEX sections_name_idx ON sections(name);

-- Insert initial sections
INSERT INTO sections (name, title, description) VALUES
  ('featured', 'Featured Work', 'A curated selection of our best photographs'),
  ('digital', 'Digital', 'Modern digital photography with threshold processing'),
  ('film', 'Film', 'Traditional film photography with digital enhancements');

-- Enable Row Level Security
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access to sections"
  ON sections FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public read access to images"
  ON images FOR SELECT
  TO public
  USING (true);
