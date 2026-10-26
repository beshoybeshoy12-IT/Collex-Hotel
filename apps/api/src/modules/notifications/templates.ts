/**
 * Bilingual notification templates. Placeholders: {{name}} etc.
 * Values are HTML-escaped when rendering the HTML body.
 */
type Tpl = { subject: string; body: string };
export const TEMPLATES: Record<string, { ar: Tpl; en: Tpl }> = {
  BOOKING_CONFIRMED: {
    ar: { subject: 'تأكيد الحجز {{confirmationNo}} - {{hotel}}', body: 'عزيزنا {{name}}،\nتم تأكيد حجزك رقم {{confirmationNo}} من {{arrival}} إلى {{departure}}.\nالإجمالي: {{total}} {{currency}}.\nيمكنك إدارة حجزك من بوابة الضيوف: {{portalUrl}}' },
    en: { subject: 'Booking confirmation {{confirmationNo}} - {{hotel}}', body: 'Dear {{name}},\nYour booking {{confirmationNo}} from {{arrival}} to {{departure}} is confirmed.\nTotal: {{total}} {{currency}}.\nManage your booking in the guest portal: {{portalUrl}}' },
  },
  BOOKING_PENDING_PAYMENT: {
    ar: { subject: 'حجزك {{confirmationNo}} بانتظار الدفع', body: 'عزيزنا {{name}}،\nحجزك رقم {{confirmationNo}} محجوز مؤقتاً حتى {{holdExpiresAt}} بانتظار دفع العربون {{deposit}} {{currency}}.' },
    en: { subject: 'Booking {{confirmationNo}} awaiting payment', body: 'Dear {{name}},\nBooking {{confirmationNo}} is held until {{holdExpiresAt}} pending a deposit of {{deposit}} {{currency}}.' },
  },
  BOOKING_MODIFIED: {
    ar: { subject: 'تم تعديل حجزك {{confirmationNo}}', body: 'عزيزنا {{name}}،\nتم تعديل حجزك. التواريخ الجديدة: {{arrival}} إلى {{departure}}. الإجمالي: {{total}} {{currency}}.' },
    en: { subject: 'Your booking {{confirmationNo}} was modified', body: 'Dear {{name}},\nYour booking was modified. New dates: {{arrival}} to {{departure}}. Total: {{total}} {{currency}}.' },
  },
  BOOKING_CANCELLED: {
    ar: { subject: 'إلغاء الحجز {{confirmationNo}}', body: 'عزيزنا {{name}}،\nتم إلغاء حجزك رقم {{confirmationNo}}. رسوم الإلغاء: {{fee}} {{currency}}.' },
    en: { subject: 'Booking {{confirmationNo}} cancelled', body: 'Dear {{name}},\nYour booking {{confirmationNo}} has been cancelled. Cancellation fee: {{fee}} {{currency}}.' },
  },
  PRE_ARRIVAL: {
    ar: { subject: 'نحن بانتظارك - {{hotel}}', body: 'عزيزنا {{name}}،\nنتطلع لاستقبالك في {{arrival}}. وقت تسجيل الدخول من {{checkInTime}}.' },
    en: { subject: 'We look forward to welcoming you - {{hotel}}', body: 'Dear {{name}},\nWe look forward to welcoming you on {{arrival}}. Check-in is from {{checkInTime}}.' },
  },
  DOCUMENT_REMINDER: {
    ar: { subject: 'وثائق الهوية المطلوبة لحجزك {{confirmationNo}}', body: 'عزيزنا {{name}}،\nيرجى رفع وثيقة الهوية المطلوبة عبر بوابة الضيوف الآمنة قبل الوصول: {{portalUrl}}' },
    en: { subject: 'Identity documents required for {{confirmationNo}}', body: 'Dear {{name}},\nPlease upload the required identity document through the secure guest portal before arrival: {{portalUrl}}' },
  },
  CHECKIN_CONFIRMED: {
    ar: { subject: 'أهلاً بك في {{hotel}}', body: 'عزيزنا {{name}}،\nتم تسجيل دخولك إلى الغرفة {{room}}. موعد المغادرة {{departure}} قبل {{checkOutTime}}.' },
    en: { subject: 'Welcome to {{hotel}}', body: 'Dear {{name}},\nYou are checked in to room {{room}}. Departure is {{departure}} by {{checkOutTime}}.' },
  },
  PAYMENT_RECEIPT: {
    ar: { subject: 'إيصال دفع - {{hotel}}', body: 'عزيزنا {{name}}،\nاستلمنا دفعتك بمبلغ {{amount}} {{currency}} للحجز {{confirmationNo}}.' },
    en: { subject: 'Payment receipt - {{hotel}}', body: 'Dear {{name}},\nWe received your payment of {{amount}} {{currency}} for booking {{confirmationNo}}.' },
  },
  PAYMENT_DUE: {
    ar: { subject: 'رصيد مستحق - {{confirmationNo}}', body: 'عزيزنا {{name}}،\nيوجد رصيد مستحق بمبلغ {{amount}} {{currency}}.' },
    en: { subject: 'Outstanding balance - {{confirmationNo}}', body: 'Dear {{name}},\nThere is an outstanding balance of {{amount}} {{currency}}.' },
  },
  SERVICE_UPDATE: {
    ar: { subject: 'تحديث طلب الخدمة', body: 'عزيزنا {{name}}،\nتم تحديث حالة طلبك إلى: {{status}}.' },
    en: { subject: 'Service request update', body: 'Dear {{name}},\nYour request status is now: {{status}}.' },
  },
  CHECKOUT_SUMMARY: {
    ar: { subject: 'ملخص المغادرة - {{hotel}}', body: 'عزيزنا {{name}}،\nشكراً لإقامتك. إجمالي الرسوم {{charges}} {{currency}}، المدفوع {{payments}} {{currency}}، الرصيد {{balance}} {{currency}}.' },
    en: { subject: 'Check-out summary - {{hotel}}', body: 'Dear {{name}},\nThank you for staying with us. Charges {{charges}} {{currency}}, payments {{payments}} {{currency}}, balance {{balance}} {{currency}}.' },
  },
  PASSWORD_RESET: {
    ar: { subject: 'إعادة تعيين كلمة المرور', body: 'مرحباً {{name}}،\nلإعادة تعيين كلمة المرور استخدم الرابط التالي خلال 30 دقيقة: {{link}}\nإذا لم تطلب ذلك فتجاهل هذه الرسالة.' },
    en: { subject: 'Password reset', body: 'Hello {{name}},\nUse this link within 30 minutes to reset your password: {{link}}\nIf you did not request this, ignore this message.' },
  },
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderTemplate(template: string, locale: string, payload: Record<string, unknown>) {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`Unknown template ${template}`);
  const lang = locale === 'en' ? 'en' : 'ar';
  const tpl = t[lang];
  const fill = (s: string, esc: boolean) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      const v = payload[k] === undefined || payload[k] === null ? '' : String(payload[k]);
      return esc ? escapeHtml(v) : v;
    });
  const text = fill(tpl.body, false);
  const html = `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><body style="font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;line-height:1.7">${fill(tpl.body, true)
    .split('\n')
    .map((l) => `<p>${l}</p>`)
    .join('')}</body></html>`;
  return { subject: fill(tpl.subject, false), text, html };
}
