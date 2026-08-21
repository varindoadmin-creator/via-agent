import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | VIA',
  description: 'Privacy policy for VIA, Varindo Intelligence Agent.',
};

export default function PrivacyPolicyPage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '56px 24px 80px', color: '#292b35', fontFamily: 'Arial, sans-serif', lineHeight: 1.6 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#1267e3', fontWeight: 700, marginBottom: 28 }}>
        <span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, background: '#1267e3', color: '#fff' }}>V</span>
        VIA
      </div>
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: '0 0 8px' }}>Privacy Policy</h1>
      <p style={{ color: '#667085', marginTop: 0 }}>Last updated: 21 August 2026</p>

      <h2>Purpose</h2>
      <p>VIA (Varindo Intelligence Agent) is an internal business operations tool used by PT Varindo and authorised personnel. It helps the team manage operational information, including Zoho Books data and WhatsApp Business messages.</p>

      <h2>Information we process</h2>
      <p>When a person contacts our WhatsApp Business number, VIA may receive and store their WhatsApp phone number, profile name when provided by WhatsApp, message content, message metadata, and delivery or read status. VIA also processes business contact and transaction data needed to operate our internal services.</p>

      <h2>How we use information</h2>
      <p>We use this information to receive, review, and respond to customer enquiries; support order and service workflows; maintain records; improve internal operations; and meet legal or accounting obligations. We do not sell personal information.</p>

      <h2>Sharing and security</h2>
      <p>Access is limited to authorised Varindo personnel and service providers that support our operations, such as Meta WhatsApp Business, Google Cloud, Supabase, Zoho Books, and approved communication services. We apply reasonable technical and organisational safeguards to protect information.</p>

      <h2>Retention</h2>
      <p>We keep information only for as long as necessary for operational, legal, accounting, dispute-resolution, and security purposes.</p>

      <h2>Your choices</h2>
      <p>You may ask us about personal information we hold about you, request correction where appropriate, or ask questions about this policy. Some information may need to be retained where required by law or legitimate business records.</p>

      <h2>Contact</h2>
      <p>For privacy questions, contact <a href="mailto:contact@varindo.co.id" style={{ color: '#1267e3' }}>contact@varindo.co.id</a>.</p>
    </main>
  );
}
