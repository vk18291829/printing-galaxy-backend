/**
 * What each institution card type contains and how big it is. Shared by spreadsheet validation,
 * the PDF renderer and (via GET /institution/templates/kinds) the website template editor.
 */
export const CARD_KINDS = ['student_id', 'teacher_id', 'out_pass', 'fee_card'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const FIELD_KEYS = [
  'name', 'rollNo', 'admissionNo', 'employeeId', 'class', 'section', 'fatherName', 'motherName',
  'dob', 'bloodGroup', 'phone', 'address', 'designation', 'department', 'qualification', 'session', 'route', 'photo',
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Name',
  rollNo: 'Roll No.',
  admissionNo: 'Adm. No.',
  employeeId: 'Emp. ID',
  class: 'Class',
  section: 'Section',
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  dob: 'D.O.B.',
  bloodGroup: 'Blood Group',
  phone: 'Phone',
  address: 'Address',
  designation: 'Designation',
  department: 'Department',
  qualification: 'Qualification',
  session: 'Session',
  route: 'Bus Route',
  photo: 'Photo',
};

/** Spreadsheet headers are matched after lower-casing and removing everything but letters/digits. */
const SYNONYMS: Record<string, FieldKey> = {
  name: 'name', studentname: 'name', fullname: 'name', teachername: 'name', staffname: 'name', employeename: 'name',
  rollno: 'rollNo', rollnumber: 'rollNo', roll: 'rollNo', rno: 'rollNo',
  admissionno: 'admissionNo', admissionnumber: 'admissionNo', admno: 'admissionNo', srno: 'admissionNo', scholarno: 'admissionNo',
  employeeid: 'employeeId', empid: 'employeeId', staffid: 'employeeId', employeecode: 'employeeId', empcode: 'employeeId', teacherid: 'employeeId',
  class: 'class', std: 'class', standard: 'class', grade: 'class', classname: 'class',
  section: 'section', sec: 'section', div: 'section', division: 'section',
  fathername: 'fatherName', fathersname: 'fatherName', father: 'fatherName', guardianname: 'fatherName', fname: 'fatherName',
  mothername: 'motherName', mothersname: 'motherName', mother: 'motherName', mname: 'motherName',
  dob: 'dob', dateofbirth: 'dob', birthdate: 'dob',
  bloodgroup: 'bloodGroup', blood: 'bloodGroup', bg: 'bloodGroup',
  phone: 'phone', mobile: 'phone', mobileno: 'phone', phoneno: 'phone', contact: 'phone', contactno: 'phone', parentmobile: 'phone',
  address: 'address', residentialaddress: 'address',
  designation: 'designation', post: 'designation', role: 'designation',
  department: 'department', dept: 'department', subject: 'department',
  qualification: 'qualification', qualifications: 'qualification', education: 'qualification', degree: 'qualification',
  session: 'session', academicyear: 'session', year: 'session',
  route: 'route', busroute: 'route', busno: 'route', transport: 'route',
  photo: 'photo', photofile: 'photo', photoname: 'photo', image: 'photo', imagefile: 'photo', picture: 'photo',
};

export function matchHeader(header: string): FieldKey | null {
  return SYNONYMS[header.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
}

export interface KindSpec {
  label: string;
  /** Product slug ordered for this card type. */
  productSlug: string;
  /** The person's unique key: duplicates are errors, and photos are matched by it. */
  idField: FieldKey;
  required: FieldKey[];
  optional: FieldKey[];
  /** Fields printed on the front by default (editable per template). */
  defaultFields: FieldKey[];
  photoRequired: boolean;
  /** Trim size in mm (landscape). Portrait templates swap them. */
  size: { w: number; h: number };
  badge: string;
}

export const KIND_SPECS: Record<CardKind, KindSpec> = {
  student_id: {
    label: 'Student ID card',
    productSlug: 'student-id-card',
    idField: 'rollNo',
    required: ['name', 'rollNo', 'class'],
    optional: ['admissionNo', 'section', 'fatherName', 'motherName', 'dob', 'bloodGroup', 'phone', 'address', 'session', 'route', 'photo'],
    defaultFields: ['class', 'rollNo', 'fatherName', 'dob', 'bloodGroup', 'phone'],
    photoRequired: true,
    size: { w: 86, h: 54 },
    badge: 'STUDENT',
  },
  teacher_id: {
    label: 'Teacher / staff ID card',
    productSlug: 'teacher-id-card',
    idField: 'employeeId',
    required: ['name', 'employeeId', 'designation'],
    optional: ['department', 'qualification', 'dob', 'bloodGroup', 'phone', 'address', 'session', 'photo'],
    defaultFields: ['designation', 'employeeId', 'department', 'bloodGroup', 'phone'],
    photoRequired: true,
    size: { w: 86, h: 54 },
    badge: 'STAFF',
  },
  out_pass: {
    label: 'Out pass card',
    productSlug: 'out-pass-card',
    idField: 'rollNo',
    required: ['name', 'rollNo', 'class'],
    optional: ['admissionNo', 'section', 'fatherName', 'phone', 'address', 'route', 'session', 'photo'],
    defaultFields: ['class', 'rollNo', 'fatherName', 'phone', 'route'],
    photoRequired: false,
    size: { w: 86, h: 54 },
    badge: 'OUT PASS',
  },
  fee_card: {
    label: 'Fee card',
    productSlug: 'fee-card',
    idField: 'admissionNo',
    required: ['name', 'admissionNo', 'class'],
    optional: ['rollNo', 'section', 'fatherName', 'phone', 'address', 'session'],
    defaultFields: ['admissionNo', 'class', 'rollNo', 'fatherName', 'phone', 'session'],
    photoRequired: false,
    // A6 landscape: room for a 12-month fee table on the back.
    size: { w: 148, h: 105 },
    badge: 'FEE CARD',
  },
};

/** Fields an institution can choose to print on the front for a card type. */
export const allowedFields = (kind: CardKind) =>
  [...KIND_SPECS[kind].required, ...KIND_SPECS[kind].optional].filter((f) => f !== 'name' && f !== 'photo');
