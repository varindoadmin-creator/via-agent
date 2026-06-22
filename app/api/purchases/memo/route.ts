import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Just validate and echo back — PDF generated client-side
  try {
    const body = await request.json();
    const { courier_name, vehicle, courier_service, date, pos } = body;
    if (!courier_name || !vehicle || !courier_service || !date || !pos?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: body });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
