import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

/**
 * NextAuth.js v5 (Auth.js) Configuration
 *
 * Simple auth setup for LinkedIn Bot
 * Users authenticate and link their LinkedIn account via OAuth
 */

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'LinkedIn',
      credentials: {},
      authorize: async () => {
        // Simple auto-login for now
        // In production, add proper user auth
        return {
          id: 'user-1',
          email: 'user@example.com',
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
