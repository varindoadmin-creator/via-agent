const mono = { fontFamily: 'JetBrains Mono, monospace' };

function Badge({ color, children }: { color: 'success' | 'warning' | 'danger' | 'neutral'; children: React.ReactNode }) {
  const map = {
    success: { color: 'var(--success)', bg: 'var(--success-bg)', border: 'var(--success-border)' },
    warning: { color: 'var(--warning)', bg: 'var(--warning-bg)', border: 'var(--warning-border)' },
    danger: { color: 'var(--danger)', bg: 'var(--danger-bg)', border: 'var(--danger-border)' },
    neutral: { color: 'var(--text-3)', bg: 'var(--surface-3)', border: 'var(--border)' },
  }[color];
  return <span style={{ ...mono, fontSize: 10, padding: '4px 8px', borderRadius: 999, color: map.color, background: map.bg, border: `1px solid ${map.border}`, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 16, scrollMarginTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{title}</h2>
      <div style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '18px 0 8px' }}>{children}</h3>;
}

function Row({ badge, children }: { badge: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
      <div style={{ flexShrink: 0, paddingTop: 1 }}>{badge}</div>
      <div>{children}</div>
    </div>
  );
}

const navLinkStyle: React.CSSProperties = { display: 'block', padding: '6px 10px', borderRadius: 6, color: 'var(--text-3)', fontSize: 12.5, textDecoration: 'none' };

export default function GuidePage() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, alignItems: 'start' }}>
      <nav style={{ position: 'sticky', top: 24, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
        <div style={{ ...mono, color: 'var(--text-4)', fontSize: 10, letterSpacing: '0.08em', padding: '4px 10px 8px' }}>DAFTAR ISI</div>
        <a href="#pendahuluan" style={navLinkStyle}>Pendahuluan</a>
        <a href="#so-approval" style={navLinkStyle}>Approval Sales Order</a>
        <a href="#po-approval" style={navLinkStyle}>Approval Purchase Order</a>
        <a href="#goods-memo" style={navLinkStyle}>Goods Collection Memo</a>
        <a href="#badge-ringkasan" style={navLinkStyle}>Ringkasan Warna Badge</a>
      </nav>

      <div>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Guide</h1>
          <p style={{ color: 'var(--text-4)', fontSize: 13, marginTop: 4 }}>Panduan penggunaan VIA untuk Admin &amp; Director — ditulis dalam Bahasa Indonesia.</p>
        </div>

        <Section id="pendahuluan" title="Pendahuluan">
          <p>
            VIA (<em>Varindo Intelligence Agent</em>) membantu proses persetujuan (approval) <strong>Sales Order (SO)</strong> dan{' '}
            <strong>Purchase Order (PO)</strong> dengan menjalankan pengecekan otomatis sebelum data disetujui di Zoho Books.
          </p>
          <p style={{ marginTop: 10 }}>
            Tujuannya sederhana: memastikan barang dikirim/dibeli ke <strong>gudang yang benar</strong> (HEAD OFFICE, HUB-BDG, HUB-MDN),
            memastikan <strong>PO tidak dibeli berlebihan</strong> dari yang sebenarnya dibutuhkan, dan memastikan{' '}
            <strong>data pelanggan/PO sudah lengkap</strong> sebelum diproses lebih lanjut. Kalau ada yang tidak sesuai, VIA akan
            menampilkan peringatan (warning) dan memblokir tombol Approve sampai masalahnya diperbaiki.
          </p>
          <p style={{ marginTop: 10, color: 'var(--text-3)' }}>
            Guide ini ditulis dalam Bahasa Indonesia supaya mudah dipahami Admin. Tampilan VIA sendiri tetap dalam Bahasa Inggris.
          </p>
        </Section>

        <Section id="so-approval" title="Approval — Sales Order">
          <p>
            Menu <strong>Approvals → Sales Order</strong> menampilkan semua SO berstatus <em>Pending Approval</em>. Klik salah satu baris
            untuk membuka detailnya — VIA akan langsung menjalankan dua pengecekan otomatis (Warehouse Check &amp; Shipping Address
            Check), dan menyediakan fitur upload bukti pesanan (VIA Check) untuk pengecekan ketiga.
          </p>

          <SubHead>A. Warehouse Check — Pengecekan Gudang</SubHead>
          <p>VIA mencocokkan <strong>Region pelanggan</strong> dengan <strong>Warehouse Location</strong> yang tercantum di SO. Aturannya:</p>
          <ul style={{ margin: '8px 0 8px 20px' }}>
            <li>Region <span style={mono}>BDG-HUB</span> (kota Bandung / Cimahi) → harus dilayani gudang <span style={mono}>HUB-BDG</span></li>
            <li>Region <span style={mono}>MDN-HUB</span> (kota Medan) → harus dilayani gudang <span style={mono}>HUB-MDN</span></li>
            <li>Selain itu → dilayani <span style={mono}>HEAD OFFICE</span></li>
          </ul>
          <p>
            VIA membaca Region dari custom field <span style={mono}>Region</span> pada data Customer di Zoho. Kalau field ini kosong,
            VIA akan menebak dari kota (City) di Billing Address pelanggan. Pengecekan dilakukan per baris item — jadi kalau satu SO
            punya beberapa item yang tersebar di gudang berbeda, dan salah satunya salah, seluruh SO tetap ditandai bermasalah.
          </p>
          <Row badge={<Badge color="success">MATCH</Badge>}>Warehouse Location di SO sudah sesuai dengan Region pelanggan.</Row>
          <Row badge={<Badge color="danger">MISMATCH</Badge>}>Warehouse Location salah — perbaiki di Zoho, pindahkan item ke warehouse yang benar.</Row>
          <Row badge={<Badge color="neutral">UNCLEAR</Badge>}>Region/kota pelanggan belum diisi di Zoho, atau SO belum punya Warehouse Location sama sekali.</Row>

          <SubHead>B. Shipping Address Check — Pengecekan Alamat Pengiriman</SubHead>
          <p>
            Tiga field ini <strong>wajib diisi di Zoho</strong> sebelum SO bisa di-approve: <strong>Shipping Address</strong> (Alamat + Kota),{' '}
            <strong>Attention</strong> (nama penerima), dan <strong>Phone Number</strong>. Kalau salah satu kosong, VIA menandai{' '}
            <Badge color="danger">INCOMPLETE</Badge> dan approval otomatis diblokir sampai Admin melengkapinya langsung di Zoho.
          </p>
          <p style={{ marginTop: 8 }}>
            Kalau ketiganya sudah lengkap, VIA otomatis memperbaiki <strong>Province (State)</strong> dan <strong>Kode Pos (Zip)</strong> —
            persis memakai logika yang sama dengan fitur <em>Customer Data Repair</em> di menu Customers: Province ditebak dari nama kota
            kalau kosong, Kode Pos dicari otomatis dari teks alamat kalau kosong. Perbaikan ini <strong>otomatis ditulis ke SO saat tombol
            Approve diklik</strong> — Admin tidak perlu langkah konfirmasi terpisah untuk bagian ini.
          </p>

          <SubHead>C. VIA Check — Pencocokan Bukti Pesanan</SubHead>
          <p>Di panel &ldquo;Upload Proof&rdquo;, unggah bukti pesanan dari pelanggan — bisa screenshot WhatsApp, PDF, gambar, atau paste teks WhatsApp langsung — lalu klik <strong>Check</strong>.</p>
          <p style={{ marginTop: 8 }}>
            VIA (dibantu AI) membaca bukti tersebut dan membandingkan nama item, jumlah (qty), dan nama pelanggan dengan data SO di Zoho.
            Kalau nama pelanggan di bukti berbeda dari nama Customer di Zoho (misal nama toko vs nama PT resmi), gunakan dropdown{' '}
            <strong>Customer Name</strong> untuk override manual sebelum menjalankan Check.
          </p>
          <Row badge={<Badge color="success">MATCH</Badge>}>Item &amp; jumlah pada bukti pesanan cocok dengan SO.</Row>
          <Row badge={<Badge color="warning">PARTIAL_MATCH</Badge>}>Sebagian item cocok, sebagian belum jelas — perlu ditinjau manual.</Row>
          <Row badge={<Badge color="danger">MISMATCH</Badge>}>Ada item atau jumlah yang tidak sesuai dengan SO.</Row>
          <Row badge={<Badge color="neutral">UNCLEAR</Badge>}>VIA tidak yakin / item tidak ditemukan di bukti pesanan.</Row>

          <SubHead>Kapan tombol &ldquo;Approve SO&rdquo; aktif?</SubHead>
          <p>
            Tombol Approve hanya aktif kalau hasil keseluruhan adalah <Badge color="success">MATCH</Badge> /{' '}
            <Badge color="success">APPROVE</Badge>. Kalau ada masalah di manapun — Warehouse Check, Shipping Address Check, atau item
            pada VIA Check — tombol otomatis nonaktif sampai masalahnya diperbaiki.
          </p>

          <SubHead>Tips supaya SO cepat di-approve</SubHead>
          <ol style={{ margin: '8px 0 0 20px' }}>
            <li>Pastikan field Region (atau minimal kota di Billing Address) Customer sudah benar di Zoho.</li>
            <li>Pastikan Warehouse Location di SO sesuai dengan Region pelanggan tersebut.</li>
            <li>Lengkapi Shipping Address, Attention, dan Phone Number di SO sebelum diajukan approval.</li>
            <li>Upload bukti pesanan yang jelas — pastikan nama pelanggan, nama/kode item, dan jumlah (qty) mudah dibaca.</li>
            <li>Kalau nama pelanggan di bukti berbeda dari Zoho, pakai dropdown Customer Name untuk override.</li>
          </ol>
        </Section>

        <Section id="po-approval" title="Approval — Purchase Order">
          <p>
            Menu <strong>Approvals → Purchase Order</strong> menampilkan semua PO berstatus <em>Pending Approval</em>. VIA mencocokkan
            setiap item di PO tersebut dengan kebutuhan Sales Order yang sudah <strong>Confirmed</strong>, sekaligus stok yang ada di
            gudang saat ini — dengan tujuan memastikan PO benar-benar dibutuhkan dan tidak membeli stok berlebihan.
          </p>

          <SubHead>Bagaimana VIA mencocokkan PO dengan kebutuhan SO</SubHead>
          <ol style={{ margin: '8px 0 0 20px' }}>
            <li>VIA membandingkan <strong>Stock on Hand</strong> vs <strong>Committed Stock</strong> di tiap gudang untuk tahu berapa <strong>Available for Sale</strong> per item. Kalau angka ini negatif, berarti barang benar-benar kurang stok dan perlu dibeli.</li>
            <li>Kekurangan itu dicocokkan ke SO Confirmed yang membutuhkan barang tersebut — SO yang lebih lama diprioritaskan lebih dulu (FIFO).</li>
            <li>PO yang sedang Pending Approval dicocokkan ke kebutuhan itu — PO yang lebih lama diprioritaskan lebih dulu.</li>
          </ol>
          <p style={{ marginTop: 8 }}>Pencocokan selalu memperhitungkan gudang (bukan hanya nama barang) — item untuk HEAD OFFICE tidak akan pernah dianggap mencukupi kebutuhan di HUB-BDG, dan sebaliknya.</p>

          <SubHead>Arti Status per PO</SubHead>
          <Row badge={<Badge color="success">OK</Badge>}>PO sudah sesuai kebutuhan SO dan gudangnya benar — aman untuk di-approve.</Row>
          <Row badge={<Badge color="warning">PARTIAL</Badge>}>PO membeli <strong>lebih sedikit</strong> dari yang dibutuhkan SO terkait. Approval tetap diblokir karena kebutuhan SO belum sepenuhnya terpenuhi — sisa kekurangannya akan muncul di tabel &ldquo;Sales Order Items Requests&rdquo; di bawah.</Row>
          <Row badge={<Badge color="danger">REGION_MIX</Badge>}>PO ini melibatkan lebih dari satu Region, ATAU Warehouse Location di PO tidak sesuai dengan Region pelanggan SO yang dilayani. Approval diblokir — satu PO harus melayani satu Region saja, supaya pergerakan stok ke Inventory benar.</Row>
          <Row badge={<Badge color="danger">NEEDS_REVIEW</Badge>}>Ada baris item di PO yang datanya tidak lengkap (item tidak terhubung ke database Zoho) — harus dicek manual.</Row>

          <SubHead>Arti Status per Item (tabel Line Items)</SubHead>
          <Row badge={<Badge color="success">matched</Badge>}>Item ini pas mencukupi kebutuhan 1 SO.</Row>
          <Row badge={<Badge color="success">multi_match</Badge>}>Item ini mencukupi kebutuhan lebih dari 1 SO sekaligus.</Row>
          <Row badge={<Badge color="warning">partial_so</Badge>}>Item ini hanya mencukupi <strong>sebagian</strong> kebutuhan SO (jumlahnya kurang).</Row>
          <Row badge={<Badge color="warning">excess_stock</Badge>}>Sebagian jumlah item ini melebihi kebutuhan SO saat ini — dibeli sebagai stok cadangan.</Row>
          <Row badge={<Badge color="neutral">for_stock</Badge>}>Item ini tidak ada kaitan dengan SO manapun saat ini — murni pembelian stok.</Row>
          <Row badge={<Badge color="danger">needs_review</Badge>}>Item tidak dikenali sistem — cek manual.</Row>

          <SubHead>Tabel &ldquo;Sales Order Items Requests&rdquo;</SubHead>
          <p>
            Tabel di bawah daftar PO ini berisi kebutuhan SO Confirmed yang <strong>belum ada PO Pending Approval-nya</strong> — sinyal
            bagi Admin untuk membuat PO baru. SO yang statusnya sudah <span style={mono}>Ordered</span> di Zoho (artinya sudah ada PO
            lain yang mengcover kebutuhannya, walau PO tersebut sudah Approved/Issued sebelumnya) tidak akan muncul di sini.
          </p>

          <SubHead>Setelah PO di-approve</SubHead>
          <p>
            Semua SO yang tercakup oleh PO tersebut otomatis diubah status Zoho-nya menjadi <span style={mono}>Ordered</span> — supaya
            siapa pun yang mengecek SO tersebut langsung tahu bahwa barangnya sudah dipesan.
          </p>

          <SubHead>Tips supaya PO cepat di-approve</SubHead>
          <ol style={{ margin: '8px 0 0 20px' }}>
            <li>Pastikan Warehouse Location di PO sesuai dengan Region pelanggan SO yang mau dipenuhi.</li>
            <li>Kalau status PARTIAL: tambah quantity di PO supaya mencukupi kebutuhan SO, atau buat PO tambahan untuk sisa kekurangannya.</li>
            <li>Kalau status REGION_MIX: pisahkan menjadi beberapa PO per Region — jangan gabungkan item untuk Region berbeda dalam satu PO.</li>
            <li>Pastikan setiap baris item di PO terhubung ke Item database di Zoho, bukan baris teks bebas.</li>
          </ol>
        </Section>

        <Section id="goods-memo" title="Goods Collection Memo">
          <p>
            Menu <strong>Documents → Goods Collection Memo</strong> dipakai untuk membuat surat jalan/tanda terima pengambilan barang
            oleh kurir, dari PO yang statusnya sudah <em>Issued</em> (sudah disetujui &amp; dikirim ke vendor).
          </p>
          <SubHead>Cara pakai</SubHead>
          <ol style={{ margin: '8px 0 0 20px' }}>
            <li>Buka menu <strong>Documents → Goods Collection Memo</strong>.</li>
            <li>VIA otomatis menampilkan daftar PO Issued dalam 7 hari terakhir.</li>
            <li>Isi <strong>Nama Kurir</strong>, <strong>Nomor Kendaraan</strong>, <strong>Jasa Kurir</strong> (Lalamove/Gojek/Grab/Other), dan <strong>Tanggal Pengambilan</strong>.</li>
            <li>Centang PO yang mau diambil kurir hari itu — boleh lebih dari satu PO sekaligus.</li>
            <li>Klik <strong>&ldquo;Print / Save as PDF&rdquo;</strong> — dokumen otomatis terbuka di tab baru, siap diprint atau disimpan sebagai PDF.</li>
          </ol>
        </Section>

        <Section id="badge-ringkasan" title="Ringkasan Warna Badge">
          <Row badge={<Badge color="success">Hijau</Badge>}>Aman / Sesuai — <span style={mono}>MATCH, OK, APPROVE, matched, multi_match</span></Row>
          <Row badge={<Badge color="warning">Kuning</Badge>}>Perlu Ditinjau — <span style={mono}>PARTIAL, PARTIAL_MATCH, REVIEW, partial_so, excess_stock</span></Row>
          <Row badge={<Badge color="danger">Merah</Badge>}>Diblokir / Tidak Sesuai — <span style={mono}>MISMATCH, REGION_MIX, NEEDS_REVIEW, INCOMPLETE, REJECT, needs_review</span></Row>
          <Row badge={<Badge color="neutral">Abu-abu</Badge>}>Tidak Diketahui / Belum Bisa Dipastikan — <span style={mono}>UNCLEAR, for_stock</span></Row>
        </Section>

        <p style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 4 }}>Ada pertanyaan lain seputar VIA? Tanyakan langsung ke tim yang mengelola VIA.</p>
      </div>
    </div>
  );
}
