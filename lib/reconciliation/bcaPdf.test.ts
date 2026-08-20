import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBcaStatementPdfText } from './bcaPdf.ts';

test('extracts BCA PDF credits and excludes debits', () => {
  const rows = parseBcaStatementPdfText(`PERIODE : MEI 2026
01/05 TRSF E-BANKING DB 0105/FTSCY/WS95051
10000000.00
VENDOR NAME
10,000,000.00 DB -997,468,037.93
04/05 TRSF E-BANKING CR 0405/FTSCY/WS95031
1459650.00
senopati, lamitak
IVAN ROBIANTO
1,459,650.00
04/05 KR OTOMATIS LLG-DBS INDONESIA
NUSANTARA SEJAHTER
0938 50,582,700.00`);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.amount), [1_459_650, 50_582_700]);
  assert.equal(rows[0].date, '04/05/2026');
  assert.equal(rows[0].nameInStatement, 'IVAN ROBIANTO');
});
