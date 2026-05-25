import { NextResponse } from 'next/server';
import { getVectorStore } from '@/lib/vectorStore';
import { saveTableEvalReport } from '@/lib/tableEval';
import { tablesToMarkdown } from '@/lib/tableUtils';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const contentId = String(formData.get('contentId') || '').trim();
    const fileName = String(formData.get('fileName') || '').trim();
    const fileType = String(formData.get('fileType') || 'application/pdf').trim();
    const parserModel = String(formData.get('parserModel') || 'llama3.2-vision').trim();
    const page = Number(formData.get('page') || 1) || 1;
    const tableJsonRaw = String(formData.get('tableJson') || '').trim();
    const tableMarkdown = String(formData.get('tableMarkdown') || '').trim();

    if (!fileName) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }
    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    const table = tableJsonRaw ? JSON.parse(tableJsonRaw) : null;
    const markdown = tableMarkdown || (table ? tablesToMarkdown({ tables: [table] }) : '');
    if (!markdown) {
      return NextResponse.json({ error: 'tableMarkdown or tableJson is required' }, { status: 400 });
    }

    const vectorStore = await getVectorStore();
    await vectorStore.addDocuments([
      {
        pageContent: `File table context (${parserModel}) for PDF ${fileName}, page ${page}:\n\n${markdown}`,
        metadata: {
          contentId: contentId || undefined,
          fileName,
          fileType,
          parserModel,
          source: 'pdf-table-context',
          page,
          uploadDate: new Date().toISOString(),
        },
      },
    ]);

    if (table && contentId) {
      try {
        await saveTableEvalReport(`data/teachersdata/content/${contentId}`, `upload_page_${page}`, {
          method: 'native',
          table,
        });
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      message: 'Table indexed successfully',
      contentId,
      page,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload table';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
