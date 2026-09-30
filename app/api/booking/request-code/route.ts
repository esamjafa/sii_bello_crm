import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ error: 'Phone-code booking has been discontinued. Please contact the salon to book.' }, { status: 410 });
}
