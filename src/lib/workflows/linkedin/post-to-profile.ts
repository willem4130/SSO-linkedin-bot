import { createPipeline } from '../Pipeline';
import { postToLinkedIn } from '@/lib/linkedin';
import { generateLinkedInPost } from '@/lib/openai';
import { db } from '@/lib/db';
import { linkedInPostsTable, accountsTable } from '@/lib/schema';
import { decrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { eq } from 'drizzle-orm';

/**
 * Post to LinkedIn Profile Workflow
 *
 * Pipeline Steps:
 * 1. Get LinkedIn credentials from database
 * 2. Generate AI content (OpenAI)
 * 3. Post to LinkedIn (ugcPosts API)
 * 4. Save to database
 */

interface PostWorkflowConfig {
  userId: string;
  prompt: string;
  systemPrompt?: string;
  dryRun?: boolean;
}

interface WorkflowContext {
  userId: string;
  prompt: string;
  systemPrompt?: string;
  dryRun?: boolean;
  accessToken?: string;
  personUrn?: string;
  generatedContent?: string;
  postResult?: {
    id: string;
    urn: string;
  };
}

export async function postToLinkedInWorkflow(config: PostWorkflowConfig) {
  const pipeline = createPipeline<WorkflowContext>();

  const result = await pipeline
    .step('get-credentials', async (ctx) => {
      logger.info({ userId: ctx.userId }, 'Fetching LinkedIn credentials');

      const account = await db
        .select()
        .from(accountsTable)
        .where(eq(accountsTable.userId, ctx.userId))
        .limit(1);

      if (account.length === 0) {
        throw new Error('LinkedIn account not connected');
      }

      const accessToken = account[0].accessToken
        ? decrypt(account[0].accessToken)
        : null;

      if (!accessToken) {
        throw new Error('LinkedIn access token not found');
      }

      return {
        ...ctx,
        accessToken,
        personUrn: `urn:li:person:${account[0].providerAccountId}`,
      };
    })
    .step('generate-content', async (ctx) => {
      logger.info({ prompt: ctx.prompt }, 'Generating LinkedIn post content');

      const content = await generateLinkedInPost(ctx.prompt, ctx.systemPrompt);

      return {
        ...ctx,
        generatedContent: content,
      };
    })
    .step('post-to-linkedin', async (ctx) => {
      if (ctx.dryRun) {
        logger.info('DRY RUN - Skipping actual post');
        return ctx;
      }

      if (!ctx.accessToken || !ctx.personUrn || !ctx.generatedContent) {
        throw new Error('Missing required data for posting');
      }

      logger.info('Posting to LinkedIn');

      const result = await postToLinkedIn(
        ctx.accessToken,
        ctx.personUrn,
        ctx.generatedContent
      );

      return {
        ...ctx,
        postResult: result,
      };
    })
    .step('save-to-database', async (ctx) => {
      logger.info('Saving post to database');

      await db.insert(linkedInPostsTable).values({
        userId: ctx.userId,
        postUrn: ctx.postResult?.urn || null,
        content: ctx.generatedContent || '',
        status: ctx.dryRun ? 'draft' : 'posted',
        postedAt: ctx.dryRun ? null : new Date(),
      });

      logger.info('Post saved to database');

      return ctx;
    })
    .execute(config);

  return result;
}
