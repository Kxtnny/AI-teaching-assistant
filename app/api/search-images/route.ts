import { NextResponse } from 'next/server';
import { searchSimilarImages } from '@/lib/imageVectorStore';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // Search for relevant images
    const images = await searchSimilarImages(query, 1);

    return NextResponse.json({
      success: true,
      images,
    });
  } catch (error) {
    console.error('Error searching images:', error);
    return NextResponse.json(
      { error: 'Failed to search images' },
      { status: 500 }
    );
  }
}
