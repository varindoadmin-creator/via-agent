import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface UnpaidInvoiceInput {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  date: string;
  due_date: string;
  total: number;
  balance: number;
}

function formatRp(n: number) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function daysOverdue(dueDate: string): number {
  if (!dueDate) return 0;
  const diff = Date.now() - new Date(dueDate).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const ROW_HEIGHT = 20;
const COL = {
  number: MARGIN,
  date: MARGIN + 95,
  due: MARGIN + 165,
  aging: MARGIN + 235,
  total: MARGIN + 300,
  balance: MARGIN + 400,
  right: PAGE_WIDTH - MARGIN,
};

export async function POST(request: NextRequest) {
  try {
    const { invoices } = await request.json() as { invoices: UnpaidInvoiceInput[] };
    if (!invoices?.length) {
      return NextResponse.json({ error: 'invoices required' }, { status: 400 });
    }

    const customerNames = [...new Set(invoices.map(i => i.customer_name))];
    const customerLabel = customerNames.length === 1 ? customerNames[0] : `${customerNames.length} customers`;

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    function drawRight(page: import('pdf-lib').PDFPage, text: string, rightX: number, y: number, size: number, f: typeof font, color: ReturnType<typeof rgb>) {
      const w = f.widthOfTextAtSize(text, size);
      page.drawText(text, { x: rightX - w, y, size, font: f, color });
    }

    let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    function drawHeader() {
      page.drawText('Statement of Account', { x: MARGIN, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
      y -= 22;
      page.drawText(`Customer: ${customerLabel}`, { x: MARGIN, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 16;
      page.drawText(`Generated: ${new Date().toLocaleDateString('id-ID')}`, { x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 24;

      page.drawRectangle({ x: MARGIN, y: y - 5, width: PAGE_WIDTH - MARGIN * 2, height: ROW_HEIGHT, color: rgb(0.93, 0.93, 0.95) });
      page.drawText('Invoice No.', { x: COL.number + 4, y, size: 9, font: bold, color: rgb(0.2, 0.2, 0.2) });
      page.drawText('Date', { x: COL.date + 4, y, size: 9, font: bold, color: rgb(0.2, 0.2, 0.2) });
      page.drawText('Due Date', { x: COL.due + 4, y, size: 9, font: bold, color: rgb(0.2, 0.2, 0.2) });
      page.drawText('Aging', { x: COL.aging + 4, y, size: 9, font: bold, color: rgb(0.2, 0.2, 0.2) });
      drawRight(page, 'Total', COL.balance - 10, y, 9, bold, rgb(0.2, 0.2, 0.2));
      drawRight(page, 'Balance Due', COL.right, y, 9, bold, rgb(0.2, 0.2, 0.2));
      y -= ROW_HEIGHT;
    }

    drawHeader();

    let totalBalance = 0;
    const sorted = [...invoices].sort((a, b) => daysOverdue(b.due_date) - daysOverdue(a.due_date));

    for (const inv of sorted) {
      if (y < MARGIN + 60) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
        drawHeader();
      }
      const aging = daysOverdue(inv.due_date);
      totalBalance += inv.balance;

      page.drawText(inv.invoice_number, { x: COL.number + 4, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
      page.drawText(inv.date || '-', { x: COL.date + 4, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(inv.due_date || '-', { x: COL.due + 4, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
      const agingColor = aging >= 60 ? rgb(0.75, 0.1, 0.1) : aging >= 30 ? rgb(0.8, 0.5, 0.05) : rgb(0.3, 0.3, 0.3);
      page.drawText(`${aging}d`, { x: COL.aging + 4, y, size: 9, font: bold, color: agingColor });
      drawRight(page, formatRp(inv.total), COL.balance - 10, y, 9, font, rgb(0.3, 0.3, 0.3));
      drawRight(page, formatRp(inv.balance), COL.right, y, 9, bold, rgb(0.75, 0.1, 0.1));

      y -= ROW_HEIGHT;
      page.drawLine({ start: { x: MARGIN, y: y + 14 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 14 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    }

    if (y < MARGIN + 40) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y: y + 14 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 14 }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(`TOTAL (${invoices.length} invoice${invoices.length > 1 ? 's' : ''})`, { x: COL.number + 4, y, size: 10, font: bold, color: rgb(0.1, 0.1, 0.1) });
    drawRight(page, formatRp(totalBalance), COL.right, y, 10, bold, rgb(0.75, 0.1, 0.1));

    const pdfBytes = await doc.save();
    const buffer = Buffer.from(pdfBytes);
    const fileCustomer = (customerNames.length === 1 ? customerNames[0] : 'multi-customer')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="statement-of-account-${fileCustomer}-${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[Unpaid PDF]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
