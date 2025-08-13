-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Create storage bucket for images
insert into storage.buckets (id, name, public) 
values ('images', 'images', true);

-- Create policy to allow public access to images
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'images' );

-- Create tables
create table sections (
  id uuid default uuid_generate_v4() primary key,
  name text not null check (name in ('featured', 'digital', 'film')),
  title text not null,
  description text,
  created_at timestamptz default now()
);

create table images (
  id uuid default uuid_generate_v4() primary key,
  section text not null check (section in ('featured', 'digital', 'film')),
  path text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Create indexes
create index images_section_idx on images(section);
create index sections_name_idx on sections(name);

-- Insert initial sections
insert into sections (name, title, description) values
  ('featured', 'Featured Work', 'A curated selection of our best photographs'),
  ('digital', 'Digital', 'Modern digital photography with threshold processing'),
  ('film', 'Film', 'Traditional film photography with digital enhancements');

-- Enable Row Level Security
alter table sections enable row level security;
alter table images enable row level security;

-- Create policies
create policy "Allow public read access to sections"
  on sections for select
  to public
  using (true);

create policy "Allow public read access to images"
  on images for select
  to public
  using (true);

-- Insert sample images
insert into images (section, path, metadata) values
  ('featured', 'https://source.unsplash.com/random/1000x1000?minimal', 
   '{"width": 1000, "height": 1000, "size": 500000, "threshold": 80}'::jsonb),
  ('digital', 'https://source.unsplash.com/random/1000x1000?architecture', 
   '{"width": 1000, "height": 1000, "size": 500000, "threshold": 80}'::jsonb),
  ('film', 'https://source.unsplash.com/random/1000x1000?portrait', 
   '{"width": 1000, "height": 1000, "size": 500000, "threshold": 80}'::jsonb);
