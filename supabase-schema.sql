-- Enable the pgvector extension
create extension if not exists vector;

-- Create the documents table
create table documents (
  id bigserial primary key,
  content text not null,
  metadata jsonb,
  embedding vector(768) -- Dimension depends on your embedding model (nomic-embed-text uses 768)
);

-- Create index for faster similarity search
create index on documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Create the match_documents function for similarity search
create or replace function match_documents (
  query_embedding vector(768),
  match_count int default 5,
  filter jsonb default '{}'
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
