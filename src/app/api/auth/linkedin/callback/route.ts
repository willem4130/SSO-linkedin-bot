import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserProfile } from '@/lib/linkedin';
import { db } from '@/lib/db';
import { accountsTable } from '@/lib/schema';
import { encrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { eq } from 'drizzle-orm';
import axios from 'axios';

/**
 * LinkedIn OAuth Callback Endpoint
 *
 * Handles OAuth callback from LinkedIn
 * Exchanges code for access token
 * Stores encrypted tokens in database
 */

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      logger.error({ error }, 'LinkedIn OAuth error');
      return NextResponse.redirect(
        new URL(`/settings?error=${error}`, request.url)
      );
    }

    if (!code || !state) {
      logger.error('Missing code or state in OAuth callback');
      return NextResponse.redirect(
        new URL('/settings?error=missing_parameters', request.url)
      );
    }

    // Verify state (CSRF protection)
    const storedState = request.cookies.get('linkedin_oauth_state')?.value;
    if (!storedState || storedState !== state) {
      logger.error('OAuth state mismatch');
      return NextResponse.redirect(
        new URL('/settings?error=invalid_state', request.url)
      );
    }

    // Exchange code for access token
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/linkedin/callback`;

    if (!clientId || !clientSecret) {
      logger.error('LinkedIn OAuth credentials not configured');
      return NextResponse.redirect(
        new URL('/settings?error=configuration_error', request.url)
      );
    }

    logger.info('Exchanging code for access token');

    const tokenResponse = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, expires_in, refresh_token } = tokenResponse.data;

    if (!access_token) {
      logger.error('No access token received from LinkedIn');
      return NextResponse.redirect(
        new URL('/settings?error=no_access_token', request.url)
      );
    }

    // Get user profile to get personUrn
    logger.info('Fetching LinkedIn profile');
    const profile = await getUserProfile(access_token);

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + (expires_in || 5184000) * 1000); // Default 60 days

    // Encrypt tokens before storing
    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = refresh_token ? encrypt(refresh_token) : null;

    // Check if account already exists
    const existingAccount = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.userId, session.user.id))
      .limit(1);

    if (existingAccount.length > 0) {
      // Update existing account
      await db
        .update(accountsTable)
        .set({
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
          providerAccountId: profile.sub,
          updatedAt: new Date(),
        })
        .where(eq(accountsTable.userId, session.user.id));

      logger.info(
        { userId: session.user.id },
        'LinkedIn account tokens updated'
      );
    } else {
      // Insert new account
      await db.insert(accountsTable).values({
        userId: session.user.id,
        provider: 'linkedin',
        providerAccountId: profile.sub,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
      });

      logger.info({ userId: session.user.id }, 'LinkedIn account connected');
    }

    // Clear state cookie
    const response = NextResponse.redirect(
      new URL('/settings?success=linkedin_connected', request.url)
    );
    response.cookies.delete('linkedin_oauth_state');

    return response;
  } catch (error) {
    logger.error({ error }, 'LinkedIn OAuth callback failed');
    return NextResponse.redirect(
      new URL('/settings?error=callback_failed', request.url)
    );
  }
}
