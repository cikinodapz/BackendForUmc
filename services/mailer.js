const required = (name, val) => {
  if (!val) throw new Error(`Missing required env: ${name}`)
  return val
}

// Lazy transporter creator so app doesn’t crash if env missing
let transporter = null
async function getTransporter() {
  if (transporter) return transporter
  try {
    // Lazy require nodemailer to avoid hard crash in environments without it installed yet
    // eslint-disable-next-line global-require
    const nodemailer = require('nodemailer')
    const host = process.env.SMTP_HOST
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS

    if (!host || !port || !user || !pass) {
      throw new Error('SMTP config incomplete')
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for others
      auth: { user, pass },
    })
    return transporter
  } catch (e) {
    console.warn('[mailer] Disabled:', e.message)
    return null
  }
}

async function sendMail({ to, subject, text, html, bcc }) {
  try {
    const t = await getTransporter()
    if (!t) return { ok: false, skipped: true, reason: 'No transporter' }
    const from = process.env.SMTP_FROM || process.env.SMTP_USER
    const info = await t.sendMail({ from, to, bcc, subject, text, html })
    return { ok: true, messageId: info.messageId }
  } catch (e) {
    console.error('[mailer] sendMail error:', e.message)
    return { ok: false, error: e.message }
  }
}

module.exports = { sendMail }

// ---------- TEMPLATES ----------
function currencyIDR(n) {
  try { return new Intl.NumberFormat('id-ID').format(Number(n || 0)) } catch { return String(n) }
}

function buildAdminBookingEmail({ booking, user, baseUrl }) {
  const id = booking?.id || '-'
  const tanggal = `${new Date(booking?.startDate).toISOString().slice(0,10)} s/d ${new Date(booking?.endDate).toISOString().slice(0,10)}`
  const total = `Rp ${currencyIDR(booking?.totalAmount)}`
  const catatan = booking?.notes ? String(booking.notes) : ''
  const dashboardUrl = `${baseUrl}/auth/login`

  const subject = `Booking Baru ${id} — Menunggu Konfirmasi`
  const text = [
    'Ada booking baru yang menunggu konfirmasi:',
    `ID: ${id}`,
    `User: ${user?.name || '-'} <${user?.email || '-'}>`,
    `Tanggal: ${tanggal}`,
    `Total: ${total}`,
    catatan ? `Catatan: ${catatan}` : '',
    '',
    `Buka dashboard admin: ${dashboardUrl}`,
  ].filter(Boolean).join('\n')

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.06);overflow:hidden;font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
          <tr>
            <td style="background:linear-gradient(90deg,#4f46e5,#7c3aed);padding:20px 24px;color:#fff;">
              <h1 style="margin:0;font-size:20px;line-height:1.4;">UMC Media Hub</h1>
              <p style="margin:4px 0 0 0;opacity:.9;font-size:13px;">Notifikasi Booking Baru</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 12px 0;font-size:18px;">Booking Menunggu Konfirmasi</h2>
              <p style="margin:0 0 16px 0;font-size:14px;color:#334155">Ada booking baru yang perlu ditinjau oleh admin.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600;width:30%">ID Booking</td>
                  <td style="padding:10px 14px">${id}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Pemesan</td>
                  <td style="padding:10px 14px">${user?.name || '-'} &lt;${user?.email || '-'}&gt;</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Tanggal</td>
                  <td style="padding:10px 14px">${tanggal}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Total</td>
                  <td style="padding:10px 14px">${total}</td>
                </tr>
                ${catatan ? `<tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Catatan</td>
                  <td style="padding:10px 14px">${catatan.replace(/</g,'&lt;')}</td>
                </tr>` : ''}
              </table>
              <div style="margin-top:20px">
                <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Buka Dashboard</a>
              </div>
              <p style="margin:16px 0 0 0;font-size:12px;color:#64748b">Jika tombol tidak berfungsi, salin dan tempel tautan berikut ke peramban Anda:<br />
                <a href="${dashboardUrl}" style="color:#4f46e5;text-decoration:underline">${dashboardUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#0f172a;color:#cbd5e1;padding:16px 24px;font-size:12px;">
              <div>© ${new Date().getFullYear()} UMC Media Hub. Semua hak dilindungi.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`

  return { subject, text, html }
}

module.exports.buildAdminBookingEmail = buildAdminBookingEmail

function buildUserBookingStatusEmail({ booking, user, status, reason, baseUrl }) {
  const id = booking?.id || '-'
  const tanggal = `${new Date(booking?.startDate).toISOString().slice(0,10)} s/d ${new Date(booking?.endDate).toISOString().slice(0,10)}`
  const total = `Rp ${currencyIDR(booking?.totalAmount)}`
  const dashboardUrl = `${baseUrl}/auth/login`
  const statusTitle = status === 'DIKONFIRMASI' ? 'Dikonfirmasi' : status === 'DITOLAK' ? 'Ditolak' : status === 'SELESAI' ? 'Selesai' : String(status || '-')
  const isCompleted = status === 'SELESAI'
  const feedbackUrl = `${baseUrl}/feedback/${id}`

  const subject = `Status Booking ${id}: ${statusTitle}`
  const lines = [
    `Halo ${user?.name || 'Pengguna'},`,
    `Status booking Anda telah diperbarui: ${statusTitle}.`,
    `ID: ${id}`,
    `Tanggal: ${tanggal}`,
    `Total: ${total}`,
  ]
  if (reason) lines.push(`Catatan Admin: ${reason}`)
  if (isCompleted) {
    lines.push('', 'Kami sangat menghargai masukan Anda.', `Beri feedback: ${feedbackUrl}`)
  }
  lines.push('', `Lihat detail di dashboard: ${dashboardUrl}`)
  const text = lines.join('\n')

  const reasonHtml = reason ? `<p style="margin:8px 0 0 0"><strong>Catatan Admin:</strong> ${String(reason).replace(/</g,'&lt;')}</p>` : ''
  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.06);overflow:hidden;font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
          <tr>
            <td style="background:linear-gradient(90deg,#4f46e5,#7c3aed);padding:20px 24px;color:#fff;">
              <h1 style="margin:0;font-size:20px;line-height:1.4;">UMC Media Hub</h1>
              <p style="margin:4px 0 0 0;opacity:.9;font-size:13px;">Status Booking Anda</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 12px 0;font-size:18px;">Booking ${statusTitle}</h2>
              <p style="margin:0 0 16px 0;font-size:14px;color:#334155">Halo ${user?.name || 'Pengguna'}, status booking Anda telah diperbarui.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600;width:30%">ID Booking</td>
                  <td style="padding:10px 14px">${id}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Status</td>
                  <td style="padding:10px 14px">${statusTitle}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Tanggal</td>
                  <td style="padding:10px 14px">${tanggal}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Total</td>
                  <td style="padding:10px 14px">${total}</td>
                </tr>
              </table>
              ${reasonHtml}
              ${isCompleted ? `<div style="margin-top:16px;padding:12px;border:1px dashed #93c5fd;border-radius:10px;background:#eff6ff">
                <p style="margin:0 0 10px 0;font-size:14px;color:#1e3a8a"><strong>Bagikan pengalaman Anda!</strong> Bantu kami meningkat dengan memberikan umpan balik.</p>
                <a href="${feedbackUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Beri Feedback</a>
              </div>` : ''}
              <div style="margin-top:20px">
                <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Lihat di Dashboard</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#0f172a;color:#cbd5e1;padding:16px 24px;font-size:12px;">
              <div>© ${new Date().getFullYear()} UMC Media Hub. Semua hak dilindungi.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`

  return { subject, text, html }
}

module.exports.buildUserBookingStatusEmail = buildUserBookingStatusEmail

// Payment email templates
function buildUserPaymentSuccessEmail({ booking, user, baseUrl }) {
  const id = booking?.id || '-'
  const tanggal = `${new Date(booking?.startDate).toISOString().slice(0,10)} s/d ${new Date(booking?.endDate).toISOString().slice(0,10)}`
  const total = `Rp ${currencyIDR(booking?.totalAmount)}`
  const dashboardUrl = `${baseUrl}/auth/login`

  const subject = `Pembayaran Berhasil untuk Booking ${id}`
  const text = [
    `Halo ${user?.name || 'Pengguna'},`,
    `Pembayaran Anda untuk booking ${id} telah berhasil kami terima.`,
    `Tanggal: ${tanggal}`,
    `Total: ${total}`,
    '',
    `Lihat detail di dashboard: ${dashboardUrl}`,
  ].join('\n')

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.06);overflow:hidden;font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
          <tr>
            <td style="background:linear-gradient(90deg,#4f46e5,#7c3aed);padding:20px 24px;color:#fff;">
              <h1 style="margin:0;font-size:20px;line-height:1.4;">UMC Media Hub</h1>
              <p style="margin:4px 0 0 0;opacity:.9;font-size:13px;">Konfirmasi Pembayaran</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 12px 0;font-size:18px;">Pembayaran Berhasil</h2>
              <p style="margin:0 0 16px 0;font-size:14px;color:#334155">Halo ${user?.name || 'Pengguna'}, pembayaran Anda telah kami terima.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600;width:30%">ID Booking</td>
                  <td style="padding:10px 14px">${id}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Tanggal</td>
                  <td style="padding:10px 14px">${tanggal}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Total</td>
                  <td style="padding:10px 14px">${total}</td>
                </tr>
              </table>
              <div style="margin-top:20px">
                <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Lihat di Dashboard</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#0f172a;color:#cbd5e1;padding:16px 24px;font-size:12px;">
              <div>© ${new Date().getFullYear()} UMC Media Hub. Semua hak dilindungi.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`

  return { subject, text, html }
}

module.exports.buildUserPaymentSuccessEmail = buildUserPaymentSuccessEmail

function buildAdminPaymentReceivedEmail({ booking, user, baseUrl }) {
  const id = booking?.id || '-'
  const tanggal = `${new Date(booking?.startDate).toISOString().slice(0,10)} s/d ${new Date(booking?.endDate).toISOString().slice(0,10)}`
  const total = `Rp ${currencyIDR(booking?.totalAmount)}`
  const dashboardUrl = `${baseUrl}/auth/login`

  const subject = `Pembayaran Masuk untuk Booking ${id}`
  const text = [
    'Ada pembayaran yang baru masuk:',
    `ID: ${id}`,
    `User: ${user?.name || '-'} <${user?.email || '-'}>`,
    `Tanggal: ${tanggal}`,
    `Total: ${total}`,
    '',
    `Buka dashboard admin: ${dashboardUrl}`,
  ].join('\n')

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.06);overflow:hidden;font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
          <tr>
            <td style="background:linear-gradient(90deg,#4f46e5,#7c3aed);padding:20px 24px;color:#fff;">
              <h1 style="margin:0;font-size:20px;line-height:1.4;">UMC Media Hub</h1>
              <p style="margin:4px 0 0 0;opacity:.9;font-size:13px;">Notifikasi Pembayaran Masuk</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 12px 0;font-size:18px;">Pembayaran Diterima</h2>
              <p style="margin:0 0 16px 0;font-size:14px;color:#334155">Ada pembayaran yang baru saja diterima.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600;width:30%">ID Booking</td>
                  <td style="padding:10px 14px">${id}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Pemesan</td>
                  <td style="padding:10px 14px">${user?.name || '-'} &lt;${user?.email || '-'}&gt;</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Tanggal</td>
                  <td style="padding:10px 14px">${tanggal}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Total</td>
                  <td style="padding:10px 14px">${total}</td>
                </tr>
              </table>
              <div style="margin-top:20px">
                <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Buka Dashboard</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#0f172a;color:#cbd5e1;padding:16px 24px;font-size:12px;">
              <div>© ${new Date().getFullYear()} UMC Media Hub. Semua hak dilindungi.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`

  return { subject, text, html }
}

module.exports.buildAdminPaymentReceivedEmail = buildAdminPaymentReceivedEmail

// Admin email: Booking completed
function buildAdminBookingCompletedEmail({ booking, user, baseUrl }) {
  const id = booking?.id || '-'
  const tanggal = `${new Date(booking?.startDate).toISOString().slice(0,10)} s/d ${new Date(booking?.endDate).toISOString().slice(0,10)}`
  const total = `Rp ${currencyIDR(booking?.totalAmount)}`
  const dashboardUrl = `${baseUrl}/auth/login`

  const subject = `Booking Selesai ${id}`
  const text = [
    'Sebuah booking telah ditandai selesai:',
    `ID: ${id}`,
    `User: ${user?.name || '-'} <${user?.email || '-'}>`,
    `Tanggal: ${tanggal}`,
    `Total: ${total}`,
    '',
    `Buka dashboard admin: ${dashboardUrl}`,
  ].join('\n')

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.06);overflow:hidden;font-family:Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
          <tr>
            <td style="background:linear-gradient(90deg,#0ea5e9,#22d3ee);padding:20px 24px;color:#fff;">
              <h1 style="margin:0;font-size:20px;line-height:1.4;">UMC Media Hub</h1>
              <p style="margin:4px 0 0 0;opacity:.9;font-size:13px;">Notifikasi Booking Selesai</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px">
              <h2 style="margin:0 0 12px 0;font-size:18px;">Booking Telah Selesai</h2>
              <p style="margin:0 0 16px 0;font-size:14px;color:#334155">Sebuah booking telah ditandai selesai oleh admin.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600;width:30%">ID Booking</td>
                  <td style="padding:10px 14px">${id}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Pemesan</td>
                  <td style="padding:10px 14px">${user?.name || '-'} &lt;${user?.email || '-'}&gt;</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Tanggal</td>
                  <td style="padding:10px 14px">${tanggal}</td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:10px 14px;font-weight:600">Total</td>
                  <td style="padding:10px 14px">${total}</td>
                </tr>
              </table>
              <div style="margin-top:20px">
                <a href="${dashboardUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">Buka Dashboard</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#0f172a;color:#cbd5e1;padding:16px 24px;font-size:12px;">
              <div>© ${new Date().getFullYear()} UMC Media Hub. Semua hak dilindungi.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`

  return { subject, text, html }
}

module.exports.buildAdminBookingCompletedEmail = buildAdminBookingCompletedEmail
