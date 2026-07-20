'use client';

import { useState } from 'react';
import { INDONESIA_PROVINCES } from '@/lib/customerCleanup/rules';

interface AddressFields {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  attention: string;
  phone: string;
}

const EMPTY_ADDRESS: AddressFields = {
  address_line1: '', address_line2: '', city: '', state: '', zip: '', attention: '', phone: '',
};

function isBlank(a: AddressFields): boolean {
  return !a.address_line1.trim() && !a.city.trim();
}

const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'block', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp = 'via-input text-xs py-2 px-3 w-full';

function AddressSection({ title, paste, setPaste, fields, setFields, parsing, onParse, extra }: {
  title: string;
  paste: string;
  setPaste: (v: string) => void;
  fields: AddressFields;
  setFields: (f: AddressFields) => void;
  parsing: boolean;
  onParse: () => void;
  extra?: React.ReactNode;
}) {
  function set<K extends keyof AddressFields>(k: K, v: string) {
    setFields({ ...fields, [k]: v });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[var(--text)] text-xs font-semibold">{title}</span>
        {extra}
      </div>
      <div>
        <textarea value={paste} onChange={e => setPaste(e.target.value)}
          placeholder="Paste the full address here (e.g. Jl. Palem Barat No.35 4, RT.4/RW.7, Duri Kepa, Kec. Kb. Jeruk, Kota Jakarta Barat, Daerah Khusus Ibukota Jakarta 11510). A name and phone number can be included too."
          rows={3}
          className="via-input text-xs py-2 px-3 w-full resize-none" />
        <button onClick={onParse} disabled={parsing || !paste.trim()}
          className="mt-2 px-3 py-1.5 text-xs bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text)] border border-[var(--border)] rounded-lg transition-colors disabled:opacity-50">
          {parsing ? 'Parsing…' : '✨ Parse Address'}
        </button>
      </div>

      <div>
        <label style={lbl}>Address</label>
        <input value={fields.address_line1} onChange={e => set('address_line1', e.target.value)} placeholder="Jl. ..." className={inp} />
      </div>
      <div>
        <label style={lbl}>Address Line 2</label>
        <input value={fields.address_line2} onChange={e => set('address_line2', e.target.value)} placeholder="Kec. / Kelurahan" className={inp} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={lbl}>City</label>
          <input value={fields.city} onChange={e => set('city', e.target.value)} placeholder="Jakarta Barat" className={inp} />
        </div>
        <div>
          <label style={lbl}>State / Province</label>
          <select value={fields.state} onChange={e => set('state', e.target.value)} className={inp}>
            <option value="">— Select —</option>
            {INDONESIA_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={lbl}>ZIP Code</label>
          <input value={fields.zip} onChange={e => set('zip', e.target.value)} placeholder="11510" className={inp} />
        </div>
        <div>
          <label style={lbl}>Country</label>
          <input value="Indonesia" disabled className={inp + ' opacity-50'} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={lbl}>Attention</label>
          <input value={fields.attention} onChange={e => set('attention', e.target.value)} placeholder="Contact name" className={inp} />
        </div>
        <div>
          <label style={lbl}>Phone</label>
          <input value={fields.phone} onChange={e => set('phone', e.target.value)} placeholder="08xx xxxx xxxx" className={inp} />
        </div>
      </div>
    </div>
  );
}

export default function FillAddressModal({ contactId, contactName, onClose, onSaved }: {
  contactId: string;
  contactName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [billingPaste, setBillingPaste] = useState('');
  const [billing, setBilling] = useState<AddressFields>(EMPTY_ADDRESS);
  const [billingParsing, setBillingParsing] = useState(false);

  const [shippingPaste, setShippingPaste] = useState('');
  const [shipping, setShipping] = useState<AddressFields>(EMPTY_ADDRESS);
  const [shippingParsing, setShippingParsing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function parse(text: string, setFields: (f: AddressFields) => void, setParsing: (v: boolean) => void) {
    setParsing(true);
    setError('');
    try {
      const res = await fetch('/api/customers/parse-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to parse address');
      setFields({
        address_line1: data.address_line1 || '',
        address_line2: data.address_line2 || '',
        city: data.city || '',
        state: data.state || '',
        zip: data.zip || '',
        attention: data.attention || '',
        phone: data.phone || '',
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (isBlank(billing) && isBlank(shipping)) {
      setError('Fill in at least Billing or Shipping address first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { contact_id: contactId };
      if (!isBlank(billing)) payload.billing_address = billing;
      if (!isBlank(shipping)) payload.shipping_address = shipping;

      const res = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save address');
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="via-card w-[560px] mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm">Fill Address</h3>
            <p className="text-[var(--text-3)] text-xs mt-0.5">{contactName}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] text-lg transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          <AddressSection
            title="Billing Address" paste={billingPaste} setPaste={setBillingPaste}
            fields={billing} setFields={setBilling} parsing={billingParsing}
            onParse={() => parse(billingPaste, setBilling, setBillingParsing)}
          />

          <div className="border-t border-[var(--border)]" />

          <AddressSection
            title="Shipping Address" paste={shippingPaste} setPaste={setShippingPaste}
            fields={shipping} setFields={setShipping} parsing={shippingParsing}
            onParse={() => parse(shippingPaste, setShipping, setShippingParsing)}
            extra={
              <button onClick={() => setShipping(billing)} disabled={isBlank(billing)}
                className="text-xs text-[var(--accent-text)] hover:underline disabled:opacity-40 disabled:no-underline">
                Copy from Billing
              </button>
            }
          />
        </div>

        {error && (
          <div className="mx-6 mb-2 p-2.5 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-lg text-[var(--danger)] text-xs flex-shrink-0">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs text-[var(--text-3)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Address'}
          </button>
        </div>

      </div>
    </div>
  );
}
