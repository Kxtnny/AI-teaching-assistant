# Image RAG Setup Guide

## Overview
Your application now supports:
- Uploading images with descriptions
- Storing images in Supabase Storage
- Retrieving relevant images using RAG (similarity search)
- Displaying images alongside AI responses

## Setup Steps

### 1. Run Database Migrations

Execute the updated SQL schema in your Supabase SQL Editor:

```sql
-- The schema in supabase-schema.sql now includes:
-- 1. images table for storing image metadata and embeddings
-- 2. match_images function for similarity search
-- 3. Row-Level Security (RLS) policies for both tables
```

Go to your Supabase dashboard → SQL Editor → New query, then paste and run the contents of `supabase-schema.sql`.

**If you already have the `documents` and `images` tables created**, run these commands separately to add the RLS policies:

```sql
-- Enable RLS and add policies for documents table
alter table documents enable row level security;

create policy "Allow public insert on documents"
  on documents for insert
  to anon, authenticated
  with check (true);

create policy "Allow public select on documents"
  on documents for select
  to anon, authenticated
  using (true);

-- Enable RLS and add policies for images table
alter table images enable row level security;

create policy "Allow public insert on images"
  on images for insert
  to anon, authenticated
  with check (true);

create policy "Allow public select on images"
  on images for select
  to anon, authenticated
  using (true);
```

### 2. Create Storage Bucket

In your Supabase dashboard:

1. Go to **Storage** → **Create a new bucket**
2. Name it: `course-images`
3. Make it **public** (so images can be displayed)
4. Click **Create bucket**

#### Configure Bucket Policies

Add these policies to make the bucket readable:

**Policy 1: Public Read Access**
```sql
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-images');
```

**Policy 2: Authenticated Upload**
```sql
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'course-images');
```

To add these:
1. Go to Storage → course-images → Policies
2. Click **New Policy**
3. Choose **Custom Policy**
4. Paste each policy above

### 3. Verify Environment Variables

Ensure your `.env.local` file has:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 4. Test the Image Upload

1. Start your development server:
   ```bash
   npm run dev
   ```

2. In the chat interface:
   - Click **Choose Image**
   - Select an image file
   - Enter a descriptive caption (e.g., "Diagram showing neural network architecture")
   - Click **Upload Image**

3. Wait for the success message

### 5. Test Image Retrieval

1. Ask a question related to your uploaded image
   - Example: "Show me information about neural networks"

2. The AI will:
   - Respond with relevant text from PDFs
   - Display relevant images below the response

## How It Works

### Upload Flow
1. User selects image + provides description
2. Image is uploaded to Supabase Storage bucket `course-images`
3. Description is converted to embedding using Ollama
4. Metadata and embedding are stored in `images` table

### Retrieval Flow
1. User asks a question
2. Question is converted to embedding
3. System searches both:
   - `documents` table (PDF text)
   - `images` table (image descriptions)
4. Relevant images are returned with similarity scores
5. Images are displayed after AI response

## File Structure

```
lib/
├── imageVectorStore.ts     # Image embedding & search functions
├── vectorStore.ts           # Text document embeddings (existing)
├── supabase.ts             # Supabase client (existing)

app/
├── api/
│   ├── upload-image/
│   │   └── route.ts        # Image upload endpoint
│   ├── upload/
│   │   └── route.ts        # PDF upload endpoint (existing)
│   └── chat/
│       └── route.tsx       # Chat with RAG (updated)
└── page.tsx                # Main UI (updated)
```

## API Endpoints

### POST `/api/upload-image`
Upload an image with description.

**Request:**
- `file`: Image file (FormData)
- `description`: Text description (FormData)

**Response:**
```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "fileName": "example.jpg",
  "url": "https://..."
}
```

### POST `/api/chat`
Send a message and receive response with relevant images.

**Request:**
```json
{
  "messages": [...]
}
```

**Response:**
Stream with embedded data containing images array.

## Customization

### Adjust Number of Retrieved Images

In [route.tsx](app/api/chat/route.tsx#L137):
```typescript
// Change from 3 to your desired number
relevantImages = await searchSimilarImages(userText, 3);
```

### Change Image Similarity Threshold

In [imageVectorStore.ts](lib/imageVectorStore.ts#L65), you can filter by similarity:
```typescript
return imagesWithUrls.filter(img => img.similarity > 0.5); // Only >50% similarity
```

### Modify Storage Bucket Name

If you want a different bucket name:

1. Change in [upload-image/route.ts](app/api/upload-image/route.ts#L39):
   ```typescript
   .from('your-bucket-name')
   ```

2. Change in [imageVectorStore.ts](lib/imageVectorStore.ts#L80):
   ```typescript
   .from('your-bucket-name')
   ```

## Troubleshooting

### "new row violates row-level security policy" error
This means RLS is enabled but policies are missing. Run these commands in Supabase SQL Editor:

```sql
-- For images table
alter table images enable row level security;

create policy "Allow public insert on images"
  on images for insert to anon, authenticated with check (true);

create policy "Allow public select on images"
  on images for select to anon, authenticated using (true);

-- For documents table (if you get same error with PDFs)
alter table documents enable row level security;

create policy "Allow public insert on documents"
  on documents for insert to anon, authenticated with check (true);

create policy "Allow public select on documents"
  on documents for select to anon, authenticated using (true);
```

### Images not appearing
- Check browser console for errors
- Verify bucket is public
- Check storage policies are correct

### Upload fails
- Verify bucket exists and name matches code
- Check authentication (anon key)
- Ensure image file type is supported

### No images returned in chat
- Verify images were uploaded successfully
- Check Supabase `images` table has entries
- Ensure `match_images` function exists

### CORS errors
- Supabase Storage should handle CORS automatically
- Verify bucket is public

## Next Steps

Consider adding:
1. Image pagination for many results
2. Image filtering by category/tags
3. Image cropping/resizing on upload
4. Multiple images per upload
5. Image deletion functionality
6. Image preview before upload
