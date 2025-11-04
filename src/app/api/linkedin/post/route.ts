import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { postToLinkedInWorkflow } from '@/lib/workflows/linkedin/post-to-profile';
import { logger } from '@/lib/logger';

/**
 * POST /api/linkedin/post
 *
 * Create a LinkedIn post
 * Body: { prompt: string, systemPrompt?: string, dryRun?: boolean }
 */

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, systemPrompt, dryRun } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    logger.info({ userId: session.user.id }, 'LinkedIn post requested');

    const result = await postToLinkedInWorkflow({
      userId: session.user.id,
      prompt,
      systemPrompt,
      dryRun,
    });

    if (!result.success) {
      logger.error({ results: result.results }, 'Post workflow failed');
      return NextResponse.json(
        {
          error: 'Failed to create post',
          details: result.results.filter((r) => !r.success),
        },
        { status: 500 }
      );
    }

    const finalData = result.finalData as {
      generatedContent?: string;
      postResult?: { id: string; urn: string };
    };

    return NextResponse.json({
      success: true,
      content: finalData.generatedContent,
      postId: finalData.postResult?.id,
      postUrn: finalData.postResult?.urn,
      dryRun: dryRun || false,
    });
  } catch (error) {
    logger.error({ error }, 'LinkedIn post API error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
