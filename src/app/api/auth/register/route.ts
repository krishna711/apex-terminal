import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    // 1. Check if admin user already exists
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json({ error: 'Registration is locked. An administrator account already exists.' }, { status: 403 });
    }

    const { username, password } = await request.json();

    if (!username || !password || username.trim().length < 3 || password.trim().length < 6) {
      return NextResponse.json({ error: 'Username must be at least 3 chars and password at least 6 chars.' }, { status: 400 });
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanPassword = password.trim();

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(cleanPassword, 10);

    // 3. Create User
    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        password: hashedPassword,
      },
    });

    // 4. Issue session cookie
    const token = await signToken({ id: user.id, username: user.username });
    const response = NextResponse.json({
      success: true,
      message: 'Administrator account registered successfully.',
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
    console.error('Registration failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to register administrator' }, { status: 500 });
  }
}
