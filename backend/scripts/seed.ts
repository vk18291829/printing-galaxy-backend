/**
 * Seeds categories, the full product catalogue from the requirements document,
 * shop settings, the owner account and a demo institution. Safe to re-run: records are upserted by slug/email.
 *
 * PRICES ARE PLACEHOLDERS — replace them in the admin panel once the owner shares the real price sheet.
 */
import { connectDb, disconnectDb } from '@/config/db';
import { env } from '@/config/env';
import { hashPassword } from '@/modules/auth/auth.service';
import { CategoryModel } from '@/modules/catalog/category.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { BannerModel } from '@/modules/marketing/banner.model';
import { getSettings } from '@/modules/settings/settings.model';
import { UserModel } from '@/modules/users/user.model';
import { EXTRA_CATEGORIES, EXTRA_PRODUCTS } from './extra-catalog';
import { STARTER_BANNERS as banners } from './starter-banners';

const L = (en: string, hi: string) => ({ en, hi });
type Tier = [minQty: number, unitPrice: number];
const tiers = (...t: Tier[]) => t.map(([minQty, unitPrice]) => ({ minQty, unitPrice }));
const book = (minQty: number, ...t: Tier[]) => ({ enabled: true, minQty, tiers: tiers(...t) });
const disabled = { enabled: false, minQty: 1, tiers: [] };

// ── Reusable options ────────────────────────────────────────────────────────

const paperSize = {
  key: 'paperSize',
  label: L('Paper size', 'पेपर साइज़'),
  required: true,
  values: [
    { value: 'A4', label: L('A4', 'A4'), isDefault: true },
    { value: 'A5', label: L('A5', 'A5'), unitDelta: -0.3 },
  ],
};

const printSides = {
  key: 'sides',
  label: L('Print sides', 'प्रिंट साइड'),
  required: true,
  values: [
    { value: 'single', label: L('Single side', 'एक तरफ़'), isDefault: true },
    { value: 'double', label: L('Double side', 'दोनों तरफ़'), unitDelta: -0.2 },
  ],
};

const binding = {
  key: 'binding',
  label: L('Binding', 'बाइंडिंग'),
  required: true,
  values: [
    { value: 'none', label: L('No binding', 'बाइंडिंग नहीं'), isDefault: true },
    { value: 'staple', label: L('Staple', 'स्टेपल'), fixedFee: 5 },
    { value: 'spiral', label: L('Spiral binding (min. 3 copies)', 'स्पाइरल बाइंडिंग (कम से कम 3 कॉपी)'), fixedFee: 40, minCopies: 3 },
    { value: 'hard', label: L('Hard binding', 'हार्ड बाइंडिंग'), fixedFee: 150 },
  ],
};

const cardFinish = {
  key: 'finish',
  label: L('Finish', 'फ़िनिश'),
  required: true,
  values: [
    { value: 'glossy', label: L('Glossy', 'ग्लॉसी'), isDefault: true },
    { value: 'matte', label: L('Matte', 'मैट'), unitDelta: 5 },
  ],
};

const lanyard = {
  key: 'lanyard',
  label: L('Lanyard', 'लेनयार्ड (डोरी)'),
  required: true,
  values: [
    { value: 'none', label: L('No lanyard', 'डोरी नहीं'), isDefault: true },
    { value: 'plain', label: L('Plain lanyard', 'सादी डोरी'), unitDelta: 12 },
    { value: 'printed', label: L('Printed with school name', 'स्कूल के नाम वाली डोरी'), unitDelta: 22 },
  ],
};

const cardHolder = {
  key: 'holder',
  label: L('Card holder', 'कार्ड होल्डर'),
  required: true,
  values: [
    { value: 'none', label: L('No holder', 'होल्डर नहीं'), isDefault: true },
    { value: 'transparent', label: L('Transparent holder', 'पारदर्शी होल्डर'), unitDelta: 8 },
  ],
};

const tieBeltSize = {
  key: 'size',
  label: L('Size', 'साइज़'),
  required: true,
  values: [
    { value: '10', label: L('10 inch', '10 इंच'), isDefault: true },
    { value: '12', label: L('12 inch', '12 इंच'), unitDelta: 5 },
    { value: '14', label: L('14 inch', '14 इंच'), unitDelta: 10 },
    { value: '16', label: L('16 inch', '16 इंच'), unitDelta: 15 },
    // Requirements doc: largest size reads like "54 inch" — to be confirmed with the owner.
    { value: '54', label: L('54 inch (senior)', '54 इंच (सीनियर)'), unitDelta: 30 },
  ],
};

const SPEC_CARD = '8.6 × 5.4 cm';
const idUploadHint = L(
  'Upload a clear scan or photo of the front and back.',
  'आगे और पीछे की साफ़ स्कैन या फ़ोटो अपलोड करें।',
);

// ── Catalogue ───────────────────────────────────────────────────────────────

const categories = [
  {
    slug: 'pvc-cards',
    name: L('PVC Card Printing', 'पीवीसी कार्ड प्रिंटिंग'),
    description: L('Durable wallet-size copies of your ID cards.', 'आपके पहचान पत्रों की टिकाऊ वॉलेट साइज़ कॉपी।'),
    icon: 'id',
    audiences: ['retail'],
    sortOrder: 1,
  },
  {
    slug: 'student-printing',
    name: L('Student Printing', 'स्टूडेंट प्रिंटिंग'),
    description: L('Notes, PPTs, photos, binding and project files.', 'नोट्स, पीपीटी, फ़ोटो, बाइंडिंग और प्रोजेक्ट फ़ाइल।'),
    icon: 'file-text',
    audiences: ['retail', 'institution'],
    sortOrder: 2,
  },
  {
    slug: 'gifts',
    name: L('Gifts & Frames', 'गिफ़्ट और फ़्रेम'),
    description: L('Personalised key chains and photo frames.', 'नाम और फ़ोटो वाले की-चेन और फ़ोटो फ़्रेम।'),
    icon: 'gift',
    audiences: ['retail', 'institution'],
    sortOrder: 3,
  },
  {
    slug: 'school-works',
    name: L('School Works', 'स्कूल वर्क्स'),
    description: L('ID cards, diaries, report cards, medals, ties and belts.', 'आईडी कार्ड, डायरी, रिपोर्ट कार्ड, मेडल, टाई और बेल्ट।'),
    icon: 'school',
    audiences: ['retail', 'institution'],
    sortOrder: 4,
  },
  {
    slug: 'business-works',
    name: L('Business Works', 'बिज़नेस वर्क्स'),
    description: L('Visiting cards, hand bills, logo key chains and stickers.', 'विज़िटिंग कार्ड, हैंडबिल, लोगो की-चेन और स्टिकर।'),
    icon: 'briefcase',
    audiences: ['retail', 'institution'],
    sortOrder: 5,
  },
];

type ProductSeed = Record<string, unknown> & { slug: string; category: string };

const pvc = (slug: string, name: ReturnType<typeof L>, sortOrder: number): ProductSeed => ({
  slug,
  category: 'pvc-cards',
  name,
  shortDescription: L('Waterproof PVC card, exact wallet size.', 'वाटरप्रूफ़ पीवीसी कार्ड, सही वॉलेट साइज़।'),
  icon: 'id',
  unit: 'card',
  workflow: 'identity',
  specs: [SPEC_CARD, 'PVC 760 micron'],
  requiresUpload: true,
  acceptedFileTypes: ['pdf', 'jpg', 'png'],
  uploadHint: idUploadHint,
  sensitive: true,
  options: [cardFinish],
  pricing: { retail: book(1, [1, 60], [5, 50]), institution: disabled },
  leadTimeDays: 0,
  sortOrder,
});

const products: ProductSeed[] = [
  pvc('aadhaar-pvc-card', L('Aadhaar PVC Card', 'आधार पीवीसी कार्ड'), 1),
  pvc('pan-pvc-card', L('PAN PVC Card', 'पैन पीवीसी कार्ड'), 2),
  pvc('voter-id-pvc-card', L('Voter ID PVC Card', 'वोटर आईडी पीवीसी कार्ड'), 3),
  pvc('ration-pvc-card', L('Ration Card (PVC)', 'राशन कार्ड (पीवीसी)'), 4),
  pvc('driving-licence-pvc-card', L('Driving Licence PVC Card', 'ड्राइविंग लाइसेंस पीवीसी कार्ड'), 5),

  // Student printing
  {
    slug: 'notes-print-bw',
    category: 'student-printing',
    name: L('Notes Print (Black & White)', 'नोट्स प्रिंट (ब्लैक एंड व्हाइट)'),
    shortDescription: L('Print your PDF notes. Minimum 100 pages.', 'अपने पीडीएफ़ नोट्स प्रिंट करें। कम से कम 100 पेज।'),
    icon: 'file-text',
    unit: 'page',
    workflow: 'standard',
    specs: ['A4 / A5', '70 GSM'],
    requiresUpload: true,
    acceptedFileTypes: ['pdf', 'doc', 'docx'],
    uploadHint: L('PDF gives the exact page count automatically.', 'पीडीएफ़ से पेज की सही गिनती अपने आप हो जाती है।'),
    options: [paperSize, printSides, binding],
    pricing: {
      retail: book(100, [1, 1.5], [300, 1.2], [1000, 1]),
      institution: book(500, [500, 1], [2000, 0.85], [5000, 0.75]),
    },
    isFeatured: true,
    sortOrder: 1,
  },
  {
    slug: 'ppt-print',
    category: 'student-printing',
    name: L('PPT Print', 'पीपीटी प्रिंट'),
    shortDescription: L('Slides printed 1, 2, 4 or 6 per page. Minimum 100 pages.', 'एक पेज पर 1, 2, 4 या 6 स्लाइड। कम से कम 100 पेज।'),
    icon: 'presentation',
    unit: 'page',
    workflow: 'standard',
    specs: ['A4 / A5'],
    requiresUpload: true,
    acceptedFileTypes: ['pdf', 'ppt', 'pptx'],
    uploadHint: L('Export your PPT as PDF for an exact page count.', 'पेज की सही गिनती के लिए पीपीटी को पीडीएफ़ में बदलें।'),
    options: [
      paperSize,
      {
        key: 'slidesPerPage',
        label: L('Slides per page', 'प्रति पेज स्लाइड'),
        required: true,
        values: [
          { value: '1', label: L('1 slide', '1 स्लाइड'), isDefault: true },
          { value: '2', label: L('2 slides', '2 स्लाइड') },
          { value: '4', label: L('4 slides', '4 स्लाइड') },
          { value: '6', label: L('6 slides', '6 स्लाइड') },
        ],
      },
      printSides,
      binding,
    ],
    pricing: {
      retail: book(100, [1, 1.5], [300, 1.2], [1000, 1]),
      institution: book(500, [500, 1], [2000, 0.85]),
    },
    sortOrder: 2,
  },
  {
    slug: 'colour-notes-print',
    category: 'student-printing',
    name: L('Colour Notes Print', 'कलर नोट्स प्रिंट'),
    shortDescription: L('Full-colour prints for diagrams and charts. Minimum 50 pages.', 'डायग्राम और चार्ट के लिए रंगीन प्रिंट। कम से कम 50 पेज।'),
    icon: 'palette',
    unit: 'page',
    workflow: 'standard',
    specs: ['A4 / A5', '90 GSM'],
    requiresUpload: true,
    acceptedFileTypes: ['pdf', 'doc', 'docx', 'ppt', 'pptx'],
    options: [paperSize, printSides, binding],
    pricing: {
      retail: book(50, [1, 5], [200, 4], [500, 3.5]),
      institution: book(200, [200, 3.5], [1000, 3]),
    },
    isFeatured: true,
    sortOrder: 3,
  },
  {
    slug: 'spiral-notebook',
    category: 'student-printing',
    name: L('Spiral Notes Copy', 'स्पाइरल नोट्स कॉपी'),
    shortDescription: L('Spiral-bound copies in fixed page counts. Minimum 3 copies.', 'तय पेज वाली स्पाइरल कॉपी। कम से कम 3 कॉपी।'),
    icon: 'notebook',
    unit: 'copy',
    workflow: 'standard',
    specs: ['100 – 500 pages'],
    requiresUpload: false,
    options: [
      {
        key: 'pages',
        label: L('Pages per copy', 'प्रति कॉपी पेज'),
        required: true,
        values: [
          { value: '100', label: L('100 pages', '100 पेज'), isDefault: true },
          { value: '150', label: L('150 pages', '150 पेज'), unitDelta: 15 },
          { value: '200', label: L('200 pages', '200 पेज'), unitDelta: 30 },
          { value: '250', label: L('250 pages', '250 पेज'), unitDelta: 45 },
          { value: '400', label: L('400 pages', '400 पेज'), unitDelta: 90 },
          { value: '500', label: L('500 pages', '500 पेज'), unitDelta: 120 },
        ],
      },
    ],
    pricing: {
      retail: book(3, [3, 60], [10, 55]),
      institution: book(50, [50, 50], [200, 45]),
    },
    sortOrder: 4,
  },
  {
    slug: 'passport-size-photos',
    category: 'student-printing',
    name: L('Passport Size Photos', 'पासपोर्ट साइज़ फ़ोटो'),
    shortDescription: L('Studio-quality prints from your photo. Minimum 50.', 'आपकी फ़ोटो से स्टूडियो क्वालिटी प्रिंट। कम से कम 50।'),
    icon: 'photo',
    unit: 'photo',
    workflow: 'standard',
    specs: ['3.5 × 4.5 cm'],
    requiresUpload: true,
    acceptedFileTypes: ['jpg', 'png'],
    uploadHint: L('Plain light background, face clearly visible.', 'सादा हल्का बैकग्राउंड, चेहरा साफ़ दिखे।'),
    options: [
      {
        key: 'background',
        label: L('Background', 'बैकग्राउंड'),
        required: true,
        values: [
          { value: 'as-is', label: L('Keep as is', 'जैसा है वैसा'), isDefault: true },
          { value: 'white', label: L('Change to white', 'सफ़ेद करें'), unitDelta: 0.5 },
        ],
      },
    ],
    pricing: { retail: book(50, [50, 2], [200, 1.5]), institution: book(200, [200, 1.5], [1000, 1.2]) },
    sortOrder: 5,
  },
  {
    slug: 'name-slip-with-photo',
    category: 'student-printing',
    name: L('Custom Name Slip with Photo', 'फ़ोटो वाली नाम पर्ची'),
    shortDescription: L('Personalised book labels with name, class and photo. Minimum 50.', 'नाम, क्लास और फ़ोटो वाले बुक लेबल। कम से कम 50।'),
    icon: 'user-square',
    unit: 'piece',
    workflow: 'design',
    specs: ['Waterproof sticker'],
    requiresUpload: true,
    acceptedFileTypes: ['jpg', 'png'],
    uploadHint: L('Upload the child photo and write name, class and school in the notes.', 'बच्चे की फ़ोटो अपलोड करें और नोट्स में नाम, क्लास और स्कूल लिखें।'),
    options: [],
    pricing: { retail: book(50, [50, 3], [200, 2.5]), institution: book(500, [500, 2], [2000, 1.6]) },
    isFeatured: true,
    sortOrder: 6,
  },
  {
    slug: 'project-file-viva',
    category: 'student-printing',
    name: L('Project File (M.A., M.Sc., Viva)', 'प्रोजेक्ट फ़ाइल (एम.ए., एम.एससी., वाइवा)'),
    shortDescription: L('Typing, printing and binding. We quote after seeing your draft.', 'टाइपिंग, प्रिंटिंग और बाइंडिंग। ड्राफ़्ट देखकर कीमत बताएँगे।'),
    icon: 'book',
    unit: 'set',
    workflow: 'quote',
    specs: ['Typing + binding'],
    requiresUpload: false,
    acceptedFileTypes: ['pdf', 'doc', 'docx', 'jpg', 'png'],
    uploadHint: L('Upload your handwritten or typed draft (optional).', 'अपना हाथ से लिखा या टाइप किया ड्राफ़्ट अपलोड करें (वैकल्पिक)।'),
    options: [
      {
        key: 'service',
        label: L('Service', 'सेवा'),
        required: true,
        values: [
          { value: 'typing-print-binding', label: L('Typing + printing + binding', 'टाइपिंग + प्रिंटिंग + बाइंडिंग'), isDefault: true },
          { value: 'print-binding', label: L('Printing + binding only', 'सिर्फ़ प्रिंटिंग + बाइंडिंग') },
        ],
      },
    ],
    pricing: { retail: book(1), institution: book(1) },
    leadTimeDays: 3,
    sortOrder: 7,
  },

  // Gifts
  {
    slug: 'photo-keychain',
    category: 'gifts',
    name: L('Photo Key Chain with Name', 'नाम और फ़ोटो वाला की-चेन'),
    shortDescription: L('Your photo and name on an acrylic key chain.', 'एक्रेलिक की-चेन पर आपकी फ़ोटो और नाम।'),
    icon: 'key',
    unit: 'piece',
    workflow: 'design',
    requiresUpload: true,
    acceptedFileTypes: ['jpg', 'png'],
    uploadHint: L('Upload a photo and type the name in the notes.', 'फ़ोटो अपलोड करें और नोट्स में नाम लिखें।'),
    options: [
      {
        key: 'size',
        label: L('Size', 'साइज़'),
        required: true,
        values: [
          { value: 'small', label: L('Small', 'छोटा'), isDefault: true },
          { value: 'large', label: L('Large', 'बड़ा'), unitDelta: 40 },
        ],
      },
    ],
    pricing: { retail: book(1, [1, 149], [10, 129]), institution: book(25, [25, 99], [100, 85]) },
    isFeatured: true,
    leadTimeDays: 2,
    sortOrder: 1,
  },
  {
    slug: 'photo-frame',
    category: 'gifts',
    name: L('Photo Frame', 'फ़ोटो फ़्रेम'),
    shortDescription: L('Normal, acrylic or LED frames in A5, A4 and 12×18.', 'नॉर्मल, एक्रेलिक या एलईडी फ़्रेम — A5, A4 और 12×18।'),
    icon: 'frame',
    unit: 'piece',
    workflow: 'design',
    requiresUpload: true,
    acceptedFileTypes: ['jpg', 'png'],
    options: [
      {
        key: 'frameType',
        label: L('Frame type', 'फ़्रेम का प्रकार'),
        required: true,
        values: [
          { value: 'normal', label: L('Normal frame', 'नॉर्मल फ़्रेम'), isDefault: true },
          { value: 'acrylic', label: L('Acrylic frame', 'एक्रेलिक फ़्रेम'), unitDelta: 200 },
          { value: 'led', label: L('LED frame', 'एलईडी फ़्रेम'), unitDelta: 350 },
        ],
      },
      {
        key: 'size',
        label: L('Size', 'साइज़'),
        required: true,
        values: [
          { value: 'A5', label: L('A5', 'A5'), isDefault: true },
          { value: 'A4', label: L('A4', 'A4'), unitDelta: 100 },
          { value: '12x18', label: L('12 × 18 inch', '12 × 18 इंच'), unitDelta: 300 },
        ],
      },
    ],
    pricing: { retail: book(1, [1, 249], [5, 229]), institution: book(10, [10, 199]) },
    isFeatured: true,
    leadTimeDays: 2,
    sortOrder: 2,
  },

  // School works
  ...(
    [
      ['student-id-card', L('Student ID Card', 'स्टूडेंट आईडी कार्ड'), 'id-badge-2', true],
      ['teacher-id-card', L('Teacher ID Card', 'टीचर आईडी कार्ड'), 'id-badge-2', false],
      ['out-pass-card', L('Out Pass Card', 'आउट पास कार्ड'), 'id', false],
    ] as const
  ).map(
    ([slug, name, icon, featured], i): ProductSeed => ({
      slug,
      category: 'school-works',
      name,
      shortDescription: L(
        'PVC card with your school logo, name and colours.',
        'स्कूल के लोगो, नाम और रंगों के साथ पीवीसी कार्ड।',
      ),
      icon,
      unit: 'card',
      workflow: 'design',
      specs: [SPEC_CARD, 'Both sides'],
      requiresUpload: false,
      acceptedFileTypes: ['pdf', 'jpg', 'png', 'csv', 'xlsx', 'zip'],
      uploadHint: L(
        'Institutions: upload the student list (Excel/CSV) and photos ZIP.',
        'संस्थान: छात्रों की सूची (Excel/CSV) और फ़ोटो की ZIP अपलोड करें।',
      ),
      options: [cardFinish, lanyard, cardHolder],
      pricing: {
        retail: book(1, [1, 80]),
        institution: book(50, [50, 30], [200, 26], [500, 22]),
      },
      isFeatured: featured,
      leadTimeDays: 3,
      sortOrder: i + 1,
    }),
  ),
  {
    slug: 'school-medal',
    category: 'school-works',
    name: L('School Medal', 'स्कूल मेडल'),
    shortDescription: L('Medals with school name and logo.', 'स्कूल के नाम और लोगो वाले मेडल।'),
    icon: 'medal',
    unit: 'piece',
    workflow: 'design',
    options: [
      {
        key: 'finish',
        label: L('Finish', 'फ़िनिश'),
        required: true,
        values: [
          { value: 'gold', label: L('Gold', 'गोल्ड'), isDefault: true },
          { value: 'silver', label: L('Silver', 'सिल्वर') },
          { value: 'bronze', label: L('Bronze', 'ब्रॉन्ज़') },
        ],
      },
      {
        key: 'size',
        label: L('Size', 'साइज़'),
        required: true,
        values: [
          { value: '50mm', label: L('50 mm', '50 मिमी'), isDefault: true },
          { value: '65mm', label: L('65 mm', '65 मिमी'), unitDelta: 15 },
        ],
      },
    ],
    pricing: { retail: book(1, [1, 70]), institution: book(20, [20, 45], [100, 38]) },
    leadTimeDays: 5,
    sortOrder: 4,
  },
  {
    slug: 'school-shield',
    category: 'school-works',
    name: L('School Shield / Trophy', 'स्कूल शील्ड / ट्रॉफ़ी'),
    shortDescription: L('Wooden and acrylic shields with engraving.', 'नक़्क़ाशी वाली लकड़ी और एक्रेलिक शील्ड।'),
    icon: 'award',
    unit: 'piece',
    workflow: 'design',
    options: [
      {
        key: 'size',
        label: L('Size', 'साइज़'),
        required: true,
        values: [
          { value: 'small', label: L('Small (8 inch)', 'छोटी (8 इंच)'), isDefault: true },
          { value: 'medium', label: L('Medium (10 inch)', 'मध्यम (10 इंच)'), unitDelta: 100 },
          { value: 'large', label: L('Large (12 inch)', 'बड़ी (12 इंच)'), unitDelta: 220 },
        ],
      },
    ],
    pricing: { retail: book(1, [1, 450]), institution: book(5, [5, 350], [25, 320]) },
    leadTimeDays: 5,
    sortOrder: 5,
  },
  {
    slug: 'school-tie',
    category: 'school-works',
    name: L('School Tie with Logo', 'लोगो वाली स्कूल टाई'),
    shortDescription: L('School name lettering and logo.', 'स्कूल के नाम और लोगो के साथ।'),
    icon: 'shirt',
    unit: 'piece',
    workflow: 'design',
    options: [tieBeltSize],
    pricing: { retail: disabled, institution: book(25, [25, 120], [100, 105], [500, 95]) },
    leadTimeDays: 10,
    sortOrder: 6,
  },
  {
    slug: 'school-belt',
    category: 'school-works',
    name: L('School Belt with Logo', 'लोगो वाली स्कूल बेल्ट'),
    shortDescription: L('Printed belt with school name and buckle logo.', 'स्कूल के नाम और बकल लोगो वाली बेल्ट।'),
    icon: 'shirt',
    unit: 'piece',
    workflow: 'design',
    options: [tieBeltSize],
    pricing: { retail: disabled, institution: book(25, [25, 110], [100, 95], [500, 85]) },
    leadTimeDays: 10,
    sortOrder: 7,
  },
  ...(
    [
      ['school-diary', L('School Diary', 'स्कूल डायरी'), 'notebook', 100, [[100, 85], [500, 72]]],
      ['report-card', L('Report Card', 'रिपोर्ट कार्ड'), 'file-certificate', 100, [[100, 12], [500, 9]]],
      ['fee-card', L('Fee Card', 'फ़ीस कार्ड'), 'cards', 100, [[100, 8], [500, 6]]],
      ['fee-receipt-book', L('Fee Receipt Book', 'फ़ीस रसीद बुक'), 'receipt', 10, [[10, 120], [50, 100]]],
      ['school-pamphlet', L('School Pamphlet', 'स्कूल पैम्फ़लेट'), 'news', 500, [[500, 1.5], [2000, 1.1]]],
      ['summer-homework-booklet', L('Summer Vacation Homework', 'गर्मी की छुट्टी का होमवर्क'), 'book', 50, [[50, 40], [200, 32]]],
    ] as const
  ).map(
    ([slug, name, icon, minQty, t], i): ProductSeed => ({
      slug,
      category: 'school-works',
      name,
      shortDescription: L('Printed with your school name, logo and format.', 'आपके स्कूल के नाम, लोगो और फ़ॉर्मेट के साथ।'),
      icon,
      unit: slug === 'school-pamphlet' || slug === 'fee-card' || slug === 'report-card' ? 'piece' : 'copy',
      workflow: 'design',
      requiresUpload: false,
      acceptedFileTypes: ['pdf', 'doc', 'docx', 'jpg', 'png'],
      uploadHint: L('Upload your current format or a sample (optional).', 'अपना मौजूदा फ़ॉर्मेट या सैंपल अपलोड करें (वैकल्पिक)।'),
      options: [],
      pricing: { retail: disabled, institution: book(minQty, ...(t as unknown as Tier[])) },
      leadTimeDays: 5,
      sortOrder: 10 + i,
    }),
  ),

  // Business works
  {
    slug: 'visiting-card',
    category: 'business-works',
    name: L('Visiting Card', 'विज़िटिंग कार्ड'),
    shortDescription: L('Premium business cards. Minimum 100.', 'प्रीमियम बिज़नेस कार्ड। कम से कम 100।'),
    icon: 'address-book',
    unit: 'piece',
    workflow: 'design',
    specs: ['9 × 5.5 cm', '300 GSM'],
    requiresUpload: false,
    acceptedFileTypes: ['pdf', 'jpg', 'png'],
    uploadHint: L('Upload your design, or your logo and details — we will design it.', 'अपना डिज़ाइन, या लोगो और जानकारी अपलोड करें — हम डिज़ाइन बना देंगे।'),
    options: [
      {
        key: 'paper',
        label: L('Paper', 'पेपर'),
        required: true,
        values: [
          { value: 'standard', label: L('Standard 300 GSM', 'स्टैंडर्ड 300 GSM'), isDefault: true },
          { value: 'matte', label: L('Matte laminated', 'मैट लैमिनेटेड'), unitDelta: 0.5 },
          { value: 'textured', label: L('Premium textured', 'प्रीमियम टेक्सचर्ड'), unitDelta: 1.5 },
        ],
      },
      {
        key: 'sides',
        label: L('Print sides', 'प्रिंट साइड'),
        required: true,
        values: [
          { value: 'single', label: L('Single side', 'एक तरफ़'), isDefault: true },
          { value: 'double', label: L('Double side', 'दोनों तरफ़'), unitDelta: 0.5 },
        ],
      },
    ],
    pricing: { retail: book(100, [100, 2], [500, 1.4], [1000, 1.1]), institution: book(500, [500, 1.2], [2000, 0.9]) },
    isFeatured: true,
    leadTimeDays: 2,
    sortOrder: 1,
  },
  {
    slug: 'hand-bill',
    category: 'business-works',
    name: L('Hand Bill / Flyer', 'हैंडबिल / पर्चा'),
    shortDescription: L('Promotional flyers in A5 or A4. Minimum 500.', 'A5 या A4 में प्रचार पर्चे। कम से कम 500।'),
    icon: 'news',
    unit: 'piece',
    workflow: 'design',
    options: [paperSize],
    pricing: { retail: book(500, [500, 1.2], [2000, 0.8]), institution: book(1000, [1000, 0.9], [5000, 0.7]) },
    sortOrder: 2,
  },
  {
    slug: 'wedding-card',
    category: 'wedding-invitations',
    name: L('Wedding Card', 'शादी का कार्ड'),
    shortDescription: L('Custom invitation cards. Minimum 50.', 'आपकी पसंद के निमंत्रण कार्ड। कम से कम 50।'),
    icon: 'heart',
    unit: 'piece',
    workflow: 'design',
    options: [],
    pricing: { retail: book(50, [50, 25], [200, 20], [500, 17]), institution: disabled },
    isFeatured: true,
    tags: ['wedding', 'shaadi', 'invitation', 'highlight'],
    leadTimeDays: 5,
    sortOrder: 0,
  },
  {
    slug: 'logo-keychain',
    category: 'business-works',
    name: L('Customised Key Chain (Logo)', 'लोगो वाला की-चेन'),
    shortDescription: L('Branded key chains for shops and events. Minimum 25.', 'दुकान और इवेंट के लिए ब्रांडेड की-चेन। कम से कम 25।'),
    icon: 'key',
    unit: 'piece',
    workflow: 'design',
    options: [],
    pricing: { retail: book(25, [25, 60], [100, 45]), institution: book(100, [100, 40], [500, 34]) },
    sortOrder: 4,
  },
  {
    slug: 'logo-sticker',
    category: 'business-works',
    name: L('Logo Sticker', 'लोगो स्टिकर'),
    shortDescription: L('Vinyl stickers in any shape. Minimum 100.', 'किसी भी आकार में विनाइल स्टिकर। कम से कम 100।'),
    icon: 'sticker',
    unit: 'piece',
    workflow: 'design',
    options: [],
    pricing: { retail: book(100, [100, 3], [500, 2]), institution: book(500, [500, 1.8], [2000, 1.4]) },
    sortOrder: 5,
  },
];

async function seed() {
  await connectDb();

  const categoryIds = new Map<string, unknown>();
  for (const c of [...categories, ...EXTRA_CATEGORIES]) {
    const doc = await CategoryModel.findOneAndUpdate({ slug: c.slug }, { $set: c }, { upsert: true, new: true });
    categoryIds.set(c.slug, doc._id);
  }
  console.log(`✔ ${categories.length + EXTRA_CATEGORIES.length} categories`);

  for (const p of [...products, ...EXTRA_PRODUCTS]) {
    const { category, ...rest } = p;
    await ProductModel.findOneAndUpdate(
      { slug: p.slug },
      { $set: { ...rest, category: categoryIds.get(category) } },
      { upsert: true, runValidators: true },
    );
  }
  console.log(`✔ ${products.length + EXTRA_PRODUCTS.length} products`);

  const settings = await getSettings();
  if (!settings.shop.phone) {
    settings.set({
      shop: {
        name: 'Printing Galaxy',
        phone: '9876543210',
        whatsapp: '9876543210',
        email: 'hello@printinggalaxy.in',
        address: 'Main Market, Your City',
        hours: 'Mon–Sat, 9:00 AM – 8:00 PM',
      },
    });
    await settings.save();
  }
  console.log('✔ settings');

  // Starter banners only when none exist, so edits made in the admin panel are never overwritten.
  if (!(await BannerModel.exists({}))) {
    await BannerModel.insertMany(banners);
    console.log(`✔ ${banners.length} banners`);
  }

  const admin = await UserModel.findOne({ email: env.SEED_ADMIN_EMAIL });
  if (!admin) {
    await UserModel.create({
      name: 'Owner',
      email: env.SEED_ADMIN_EMAIL,
      passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
      role: 'admin',
    });
    console.log(`✔ admin ${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD}`);
  } else {
    console.log(`• admin ${env.SEED_ADMIN_EMAIL} already exists`);
  }

  const demoEmail = 'demo-school@printinggalaxy.in';
  if (!(await InstitutionModel.exists({ email: demoEmail }))) {
    await InstitutionModel.create({
      name: 'Galaxy Public School (Demo)',
      type: 'school',
      contactName: 'Principal',
      email: demoEmail,
      phone: '9876500000',
      passwordHash: await hashPassword('School@123'),
      address: { line1: 'School Road', city: 'Your City', state: 'Uttar Pradesh', pincode: '226001' },
      size: 800,
      status: 'approved',
      reviewedAt: new Date(),
    });
    console.log(`✔ demo institution ${demoEmail} / School@123`);
  }

  await disconnectDb();
}

seed().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
