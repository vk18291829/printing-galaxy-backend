/** Starter home page content: offer strip messages, hero slides, promo tiles and a new-feature banner. */
const L = (en: string, hi: string) => ({ en, hi });

export const STARTER_BANNERS = [
  { kind: 'offer', title: L('Schools & businesses: bulk prices from 50+ units — register free', 'स्कूल और बिज़नेस: 50+ यूनिट पर बल्क कीमतें — मुफ़्त रजिस्टर करें'), link: '/institutions/register', sortOrder: 1 },
  { kind: 'offer', title: L('Free delivery on orders above ₹999', '₹999 से ऊपर के ऑर्डर पर मुफ़्त डिलीवरी'), link: '/pricing', sortOrder: 2 },
  { kind: 'offer', title: L('Same-day printing for notes & PPTs', 'नोट्स और PPT की उसी दिन प्रिंटिंग'), link: '/products?category=student-printing', sortOrder: 3 },
  {
    kind: 'hero',
    title: L('ID cards for the whole school, in one upload', 'पूरे स्कूल के ID कार्ड, एक ही अपलोड में'),
    subtitle: L('Send a spreadsheet with photos — we print, laminate and deliver.', 'फ़ोटो के साथ स्प्रेडशीट भेजें — हम प्रिंट, लेमिनेट और डिलीवर करेंगे।'),
    ctaLabel: L('Start bulk order', 'बल्क ऑर्डर शुरू करें'),
    link: '/institutions',
    theme: 'dark',
    badge: 'For schools',
    sortOrder: 1,
  },
  {
    kind: 'hero',
    title: L('Photo gifts that feel personal', 'दिल को छू लेने वाले फ़ोटो गिफ़्ट'),
    subtitle: L('Key chains, frames and more — preview your design before we print.', 'की-चेन, फ़्रेम और बहुत कुछ — प्रिंट से पहले अपना डिज़ाइन देखें।'),
    ctaLabel: L('Shop gifts', 'गिफ़्ट देखें'),
    link: '/products?category=gifts',
    theme: 'magenta',
    badge: 'Gifts',
    sortOrder: 2,
  },
  {
    kind: 'hero',
    title: L('Notes & PPT prints from ₹1/page', 'नोट्स और PPT प्रिंट ₹1/पेज से'),
    subtitle: L('Upload your PDF, pick binding and collect the same day.', 'अपनी PDF अपलोड करें, बाइंडिंग चुनें और उसी दिन ले जाएँ।'),
    ctaLabel: L('Print now', 'अभी प्रिंट करें'),
    link: '/products?category=student-printing',
    theme: 'blue',
    badge: 'Students',
    sortOrder: 3,
  },
  { kind: 'promo', title: L('PVC cards', 'PVC कार्ड'), subtitle: L('Aadhaar, PAN & ID cards', 'आधार, पैन और ID कार्ड'), ctaLabel: L('Explore', 'देखें'), link: '/products?category=pvc-cards', theme: 'blue', badge: 'Popular', sortOrder: 1 },
  { kind: 'promo', title: L('Business essentials', 'बिज़नेस ज़रूरतें'), subtitle: L('Visiting cards, stickers & hand bills', 'विज़िटिंग कार्ड, स्टिकर और हैंड बिल'), ctaLabel: L('Explore', 'देखें'), link: '/products?category=business-works', theme: 'sunset', sortOrder: 2 },
  { kind: 'promo', title: L('School supplies', 'स्कूल सामग्री'), subtitle: L('Medals, ties, belts & shields', 'मेडल, टाई, बेल्ट और शील्ड'), ctaLabel: L('Explore', 'देखें'), link: '/products?category=school-works', theme: 'mint', sortOrder: 3 },
  {
    kind: 'feature',
    title: L('New: design studio with live preview', 'नया: लाइव प्रीव्यू के साथ डिज़ाइन स्टूडियो'),
    subtitle: L('Crop photos, pick a layout and see exactly what we will print.', 'फ़ोटो क्रॉप करें, लेआउट चुनें और देखें कि हम क्या प्रिंट करेंगे।'),
    ctaLabel: L('Try it', 'आज़माएँ'),
    link: '/products?category=gifts',
    theme: 'magenta',
    badge: 'NEW',
    sortOrder: 1,
  },
];

