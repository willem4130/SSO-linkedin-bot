import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

/**
 * LinkedIn OAuth Authorization Endpoint
 *
 * Redirects user to LinkedIn for authentication
 * Stores state for CSRF protection
 */

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/linkedin/callback`;

    if (!clientId) {
      logger.error('LINKEDIN_CLIENT_ID not configured');
      return NextResponse.json(
        { error: 'LinkedIn OAuth not configured' },
        { status: 500 }
      );
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store state in cookie for validation on callback
    const response = NextResponse.redirect(
      `https://www.linkedin.com/oauth/v2/authorization?` +
        `response_type=code&` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${state}&` +
        `scope=${encodeURIComponent('openid profile email w_member_social')}`
    );

    response.cookies.set('linkedin_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });

    logger.info({ userId: session.user.id }, 'LinkedIn OAuth started');

    return response;
  } catch (error) {
    logger.error({ error }, 'LinkedIn OAuth authorization failed');
    return NextResponse.json(
      { error: 'Failed to start OAuth flow' },
      { status: 500 }
    );
  }
}
