-- Enable the pgvector extension
create extension if not exists vector;

-- Create the documents table
create table documents (
  id bigserial primary key,
  content text not null,
  metadata jsonb,
  embedding vector(768) -- Dimension depends on your embedding model (nomic-embed-text uses 768)
);

-- Enable RLS on documents table
alter table documents enable row level security;

-- Allow anonymous/authenticated users to insert documents
create policy "Allow public insert on documents"
  on documents for insert
  to anon, authenticated
  with check (true);

-- Allow anonymous/authenticated users to select documents
create policy "Allow public select on documents"
  on documents for select
  to anon, authenticated
  using (true);

-- Create index for faster similarity search
create index on documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Create the match_documents function for similarity search
create or replace function match_documents (
  filter jsonb default '{}',
  match_count int default 5,
  query_embedding vector(768)
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create the images table
create table images (
  id bigserial primary key,
  description text not null,
  file_name text not null,
  storage_path text not null,
  metadata jsonb,
  embedding vector(768),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on images table
alter table images enable row level security;

-- Allow anonymous/authenticated users to insert images
create policy "Allow public insert on images"
  on images for insert
  to anon, authenticated
  with check (true);

-- Allow anonymous/authenticated users to select images
create policy "Allow public select on images"
  on images for select
  to anon, authenticated
  using (true);

-- Create index for faster similarity search on images
create index on images using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Create the match_images function for similarity search
create or replace function match_images (
  query_embedding vector(768),
  match_count int default 3,
  filter jsonb default '{}'
) returns table (
  id bigint,
  description text,
  file_name text,
  storage_path text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    images.id,
    images.description,
    images.file_name,
    images.storage_path,
    images.metadata,
    1 - (images.embedding <=> query_embedding) as similarity
  from images
  where images.metadata @> filter
  order by images.embedding <=> query_embedding
  limit match_count;
end;
$$;
