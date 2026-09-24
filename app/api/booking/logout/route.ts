import { NextResponse } from 'next/server';import { clearBookingSession } from '@/lib/booking-auth';export async function POST(){await clearBookingSession();return NextResponse.json({ok:true});}
