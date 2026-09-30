import { NextResponse } from 'next/server';
export async function POST(){return NextResponse.json({error:'Use /api/crm-documents with customerId'},{status:410});}
