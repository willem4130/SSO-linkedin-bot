import OpenAI from 'openai';
import { createOpenAICircuitBreaker } from './resilience';
import { openaiRateLimiter, withRateLimit } from './rate-limiter';
import { logger } from './logger';

/**
 * OpenAI API Client for LinkedIn Content Generation
 *
 * Features:
 * - Circuit breaker to prevent hammering failing API
 * - Rate limiting (500 req/min)
 * - Structured logging
 * - 60s timeout for AI generation
 */

if (!process.env.OPENAI_API_KEY) {
  logger.warn('⚠️  OPENAI_API_KEY is not set. AI features will not work.');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  timeout: 60000, // 60 second timeout
});

/**
 * Generate LinkedIn post (internal)
 */
async function generateLinkedInPostInternal(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  logger.info({ promptLength: prompt.length, hasSystemPrompt: !!systemPrompt }, 'Generating LinkedIn post with AI');

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  // System prompt for professional LinkedIn content
  const defaultSystemPrompt = `You are a professional LinkedIn content creator. Create engaging, valuable posts that:
- Provide actionable insights
- Use professional but conversational tone
- Include relevant examples or stories when appropriate
- Keep under 3,000 characters (LinkedIn's limit)
- Format with line breaks for readability
- Don't use hashtags unless specifically requested`;

  messages.push({
    role: 'system',
    content: systemPrompt || defaultSystemPrompt,
  });

  messages.push({
    role: 'user',
    content: prompt,
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 1000,
    temperature: 0.8,
  });

  const result = completion.choices[0]?.message?.content || '';
  logger.info({ resultLength: result.length }, 'LinkedIn post generated successfully');
  return result;
}

/**
 * Generate LinkedIn post (protected with circuit breaker + rate limiting)
 */
const generateLinkedInPostWithBreaker = createOpenAICircuitBreaker(generateLinkedInPostInternal);
export const generateLinkedInPost = withRateLimit(
  (prompt: string, systemPrompt?: string) => generateLinkedInPostWithBreaker.fire(prompt, systemPrompt),
  openaiRateLimiter
);
