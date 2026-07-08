import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanPassword = password.trim();

    // 1. Find user in database
    const user = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }

    // 2. Validate password
    const isMatch = await bcrypt.compare(cleanPassword, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
    }

    // 3. Issue session cookie
    const token = await signToken({ id: user.id, username: user.username });
    const response = NextResponse.json({
      success: true,
      message: 'Logged in successfully.',
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
      sameSite: 'lax',
    });

    return response;

  } catch (error: any) {
    console.error('Login failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to authenticate user' }, { status: 500 });
  }
}
