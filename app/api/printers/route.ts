import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const { stdout } = await execAsync('lpstat -a 2>/dev/null || echo ""');
    const printers = stdout
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.split(' ')[0])
      .filter(Boolean);
    return NextResponse.json({ success: true, printers });
  } catch {
    return NextResponse.json({ success: true, printers: [] });
  }
}
