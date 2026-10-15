import type { CardKind } from './card-kinds';

/** Dummy people for template previews. */
export const SAMPLE_RECORDS: Record<CardKind, Record<string, string>[]> = {
  student_id: [
    { name: 'Aarav Sharma', rollNo: '1023', class: 'VII', section: 'B', fatherName: 'Rajesh Sharma', dob: '14-03-2013', bloodGroup: 'B+', phone: '9876543210', address: '12, Civil Lines, Jhansi', session: '2026-27' },
    { name: 'Ananya Verma', rollNo: '1024', class: 'VII', section: 'B', fatherName: 'Sunil Verma', dob: '02-11-2012', bloodGroup: 'O+', phone: '9812345678', address: '45, Sadar Bazar, Jhansi', session: '2026-27' },
  ],
  teacher_id: [
    { name: 'Meena Gupta', employeeId: 'T-017', designation: 'PGT Mathematics', department: 'Science', bloodGroup: 'A+', phone: '9898989898', address: '7, Teachers Colony, Jhansi' },
    { name: 'Rohit Singh', employeeId: 'T-021', designation: 'TGT English', department: 'Languages', bloodGroup: 'AB+', phone: '9797979797' },
  ],
  out_pass: [
    { name: 'Kabir Khan', rollNo: '2045', class: 'X', section: 'A', fatherName: 'Imran Khan', phone: '9765432101', route: 'Route 4 - Sipri Bazar' },
  ],
  fee_card: [
    { name: 'Diya Patel', admissionNo: 'A-3381', rollNo: '18', class: 'IV', section: 'C', fatherName: 'Nilesh Patel', phone: '9123456780', session: '2026-27' },
  ],
};
