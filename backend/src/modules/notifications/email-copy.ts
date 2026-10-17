import { env } from '@/config/env';

/**
 * Email wording in English and Hindi. SMS keeps its own short English texts (DLT templates);
 * emails have no length limit, so these are full sentences.
 */
export type Lang = 'en' | 'hi';

export const asLang = (v: unknown): Lang => (v === 'hi' ? 'hi' : 'en');

const site = (path = '') => `${env.WEBSITE_URL.replace(/\/$/, '')}${path}`;

/** Follows "Your order PG…" / "आपका ऑर्डर PG…". */
const STATUS_SENTENCE: Record<string, Record<Lang, string>> = {
  quote_pending: { en: 'has been received. We will share the price shortly', hi: 'प्राप्त हो गया है। हम जल्द ही कीमत बताएँगे' },
  awaiting_payment: { en: 'is waiting for payment. Pay from My orders to start printing', hi: 'भुगतान की प्रतीक्षा में है। प्रिंटिंग शुरू करने के लिए मेरे ऑर्डर से भुगतान करें' },
  delivery_failed: { en: 'could not be delivered today', hi: 'आज डिलीवर नहीं हो सका' },
  refunded: { en: 'refund has been started. It reaches your account in 5–7 working days', hi: 'का रिफ़ंड शुरू हो गया है। यह 5–7 कार्य दिवसों में आपके खाते में पहुँचेगा' },
  received: { en: 'has been received', hi: 'प्राप्त हो गया है' },
  proof_sent: { en: 'proof is ready for your approval', hi: 'का प्रूफ़ आपकी मंज़ूरी के लिए तैयार है' },
  approved: { en: 'is approved and queued for printing', hi: 'मंज़ूर हो गया है और प्रिंटिंग की कतार में है' },
  printing: { en: 'is being printed', hi: 'प्रिंट हो रहा है' },
  ready: { en: 'is ready for pickup', hi: 'पिकअप के लिए तैयार है' },
  out_for_delivery: { en: 'is on its way', hi: 'डिलीवरी के लिए निकल चुका है' },
  delivered: { en: 'has been delivered. Thank you for ordering with us!', hi: 'डिलीवर हो गया है। हमसे ऑर्डर करने के लिए धन्यवाद!' },
  picked_up: { en: 'has been picked up. Thank you!', hi: 'ले लिया गया है। धन्यवाद!' },
  cancelled: { en: 'has been cancelled', hi: 'रद्द कर दिया गया है' },
};

/** Short labels for subjects. */
const STATUS_LABEL: Record<string, Record<Lang, string>> = {
  quote_pending: { en: 'Received, price coming soon', hi: 'प्राप्त, कीमत जल्द' },
  awaiting_payment: { en: 'Payment pending', hi: 'भुगतान बाकी' },
  delivery_failed: { en: 'Delivery not completed', hi: 'डिलीवरी नहीं हो सकी' },
  refunded: { en: 'Refund started', hi: 'रिफ़ंड शुरू' },
  received: { en: 'Received', hi: 'प्राप्त हुआ' },
  proof_sent: { en: 'Proof ready to approve', hi: 'प्रूफ़ तैयार' },
  approved: { en: 'Approved', hi: 'मंज़ूर' },
  printing: { en: 'Printing', hi: 'प्रिंट हो रहा है' },
  ready: { en: 'Ready for pickup', hi: 'पिकअप के लिए तैयार' },
  out_for_delivery: { en: 'Out for delivery', hi: 'डिलीवरी के लिए निकला' },
  delivered: { en: 'Delivered', hi: 'डिलीवर हुआ' },
  picked_up: { en: 'Picked up', hi: 'ले लिया गया' },
  cancelled: { en: 'Cancelled', hi: 'रद्द' },
};

const hello = (lang: Lang, name?: string | null) => {
  const first = name?.trim().split(/\s+/)[0];
  return lang === 'hi' ? `नमस्ते${first ? ` ${first}` : ''},` : `Hi${first ? ` ${first}` : ''},`;
};

export function orderEmail(p: {
  lang: Lang;
  name?: string | null;
  orderNumber: string;
  orderId: string;
  status: string;
  note?: string;
  code?: string;
  invoiceAttached?: boolean;
}) {
  const { lang, orderNumber: n } = p;
  const label = STATUS_LABEL[p.status]?.[lang] ?? p.status.replace(/_/g, ' ');
  const sentence = STATUS_SENTENCE[p.status]?.[lang] ?? label;
  const lines = [hello(lang, p.name), lang === 'hi' ? `आपका ऑर्डर ${n} ${sentence}।` : `Your order ${n} ${sentence}.`];
  if (p.code && p.status === 'ready') {
    lines.push(lang === 'hi' ? `काउंटर पर यह कोड दिखाएँ: ${p.code}` : `Show this code at the counter: ${p.code}`);
  } else if (p.code && p.status === 'out_for_delivery') {
    lines.push(
      lang === 'hi'
        ? `डिलीवरी कोड: ${p.code}\nऑर्डर मिलने के बाद ही यह कोड डिलीवरी वाले को बताएँ।`
        : `Delivery code: ${p.code}\nGive it to the delivery person only after you receive your order.`,
    );
  }
  if (p.note) lines.push(p.note);
  if (p.invoiceAttached) lines.push(lang === 'hi' ? 'आपका बिल (PDF) इस ईमेल के साथ लगा है।' : 'Your invoice (PDF) is attached to this email.');
  return {
    subject: lang === 'hi' ? `ऑर्डर ${n}: ${label}` : `Order ${n}: ${label}`,
    text: lines.join('\n\n'),
    action: { label: lang === 'hi' ? 'ऑर्डर देखें' : 'View your order', url: site(`/account/orders/${p.orderId}`) },
  };
}

const OTP: Record<'login' | 'password_reset' | 'track', Record<Lang, { subject: string; intro: string }>> = {
  login: {
    en: { subject: 'Your Printing Galaxy sign-in code', intro: 'Use this code to sign in to Printing Galaxy:' },
    hi: { subject: 'Printing Galaxy साइन-इन कोड', intro: 'Printing Galaxy में साइन इन करने के लिए यह कोड डालें:' },
  },
  password_reset: {
    en: { subject: 'Reset your Printing Galaxy password', intro: 'Use this code to set a new password for your institution account:' },
    hi: { subject: 'Printing Galaxy पासवर्ड बदलें', intro: 'अपने संस्थान खाते का नया पासवर्ड बनाने के लिए यह कोड डालें:' },
  },
  track: {
    en: { subject: 'Your order tracking code', intro: 'Use this code to see the progress of your order:' },
    hi: { subject: 'ऑर्डर ट्रैक करने का कोड', intro: 'अपने ऑर्डर की स्थिति देखने के लिए यह कोड डालें:' },
  },
};

export function otpEmail(purpose: keyof typeof OTP, lang: Lang, code: string) {
  const copy = OTP[purpose][lang];
  const tail =
    lang === 'hi'
      ? `यह ${env.OTP_TTL_MINUTES} मिनट में ख़त्म हो जाएगा। इसे किसी को न बताएँ, हमारे स्टाफ़ को भी नहीं। अगर आपने यह कोड नहीं माँगा, तो इस ईमेल को अनदेखा करें।`
      : `It expires in ${env.OTP_TTL_MINUTES} minutes. Never share it with anyone, including our staff. If you did not ask for it, you can ignore this email.`;
  return { subject: `${code} · ${copy.subject}`, text: `${copy.intro}\n\n${code}\n\n${tail}` };
}

export function welcomeEmail(lang: Lang, name?: string | null) {
  return lang === 'hi'
    ? {
        subject: 'Printing Galaxy में आपका स्वागत है',
        text: `${hello(lang, name)}\n\nसाइन अप करने के लिए धन्यवाद। अब आप नोट्स, PVC कार्ड, ID कार्ड, विज़िटिंग कार्ड और गिफ़्ट ऑनलाइन ऑर्डर कर सकते हैं, ऑर्डर से पहले कीमत देख सकते हैं और हर ऑर्डर ट्रैक कर सकते हैं।\n\nजब भी आपका ऑर्डर आगे बढ़ेगा, हम आपको ईमेल करेंगे। साइन इन के लिए पासवर्ड की ज़रूरत नहीं: इसी ईमेल पर भेजे गए कोड से कभी भी साइन इन करें।`,
        action: { label: 'ऑर्डर शुरू करें', url: site('/products') },
      }
    : {
        subject: 'Welcome to Printing Galaxy',
        text: `${hello(lang, name)}\n\nThanks for signing up. You can now order notes, PVC cards, ID cards, visiting cards and gifts online, see the price before you order, and track every order.\n\nWe will email you whenever your order moves forward. No password needed: sign in any time with a code sent to this email.`,
        action: { label: 'Start an order', url: site('/products') },
      };
}

export function institutionRegisteredEmail(lang: Lang, p: { name: string; contactName?: string | null }) {
  return lang === 'hi'
    ? {
        subject: 'आपका संस्थान पंजीकरण मिल गया है',
        text: `${hello(lang, p.contactName)}\n\nहमें ${p.name} का पंजीकरण मिल गया है। हम इसकी जाँच करेंगे (आमतौर पर 1 कार्य दिवस में) और मंज़ूरी मिलते ही आपको ईमेल करेंगे।\n\nतब तक आप सामान्य कीमतों पर ऑर्डर कर सकते हैं।`,
        action: { label: 'साइन इन करें', url: site('/institutions/login') },
      }
    : {
        subject: 'We received your institution registration',
        text: `${hello(lang, p.contactName)}\n\nWe received the registration for ${p.name}. We will review it, usually within 1 working day, and email you as soon as it is approved.\n\nUntil then you can order at individual prices.`,
        action: { label: 'Sign in', url: site('/institutions/login') },
      };
}

export function institutionReviewedEmail(lang: Lang, p: { name: string; contactName?: string | null; approved: boolean; reason?: string }) {
  if (lang === 'hi') {
    return p.approved
      ? {
          subject: 'आपका संस्थान खाता मंज़ूर हो गया है',
          text: `${hello(lang, p.contactName)}\n\nख़ुशख़बरी: ${p.name} मंज़ूर हो गया है। साइन इन करने पर अब संस्थान की कीमतें लागू होंगी।`,
          action: { label: 'साइन इन करें', url: site('/institutions/login') },
        }
      : {
          subject: 'आपके संस्थान खाते के बारे में',
          text: `${hello(lang, p.contactName)}\n\nहम ${p.name} को मंज़ूरी नहीं दे सके।${p.reason ? `\n\nकारण: ${p.reason}` : ''}\n\nकोई सवाल हो तो दुकान पर कॉल करें।`,
        };
  }
  return p.approved
    ? {
        subject: 'Your institution account is approved',
        text: `${hello(lang, p.contactName)}\n\nGood news: ${p.name} is approved. Institution prices are now active when you sign in.`,
        action: { label: 'Sign in', url: site('/institutions/login') },
      }
    : {
        subject: 'About your institution account',
        text: `${hello(lang, p.contactName)}\n\nWe could not approve ${p.name}.${p.reason ? `\n\nReason: ${p.reason}` : ''}\n\nPlease call the shop if you have questions.`,
      };
}

export function promoFooter(lang: Lang) {
  return lang === 'hi'
    ? { text: 'आपको ये ईमेल इसलिए मिल रहे हैं क्योंकि आपका हमारे साथ खाता है।', linkLabel: 'ऑफ़र ईमेल बंद करें' }
    : { text: 'You get these emails because you have an account with us.', linkLabel: 'Stop offer emails' };
}
