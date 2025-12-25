/**
 * Config API Route
 * Exposes configuration status (never actual values) to the client
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';

export async function GET() {
    return NextResponse.json({
        hasEnvPassword: ACCESS_PASSWORD.length > 0,
    });
}

export async function POST(request: NextRequest) {
    try {
        const { password } = await request.json();

        if (!ACCESS_PASSWORD) {
            return NextResponse.json({ valid: false, message: 'No env password set' });
        }

        const valid = password === ACCESS_PASSWORD;
        return NextResponse.json({ valid });
    } catch {
        return NextResponse.json({ valid: false, message: 'Invalid request' }, { status: 400 });
    }
}
