import { NextResponse } from 'next/server';
import { clearSession, currentUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
export async function POST() { const user=await currentUser(); if(user) await audit(user,'LOGOUT','session',user.id); await clearSession(); return NextResponse.json({ ok: true }); }
