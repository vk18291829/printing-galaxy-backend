import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '@/lib/api-client';

/** Same shape as the website's roster (backend modules/roster). */
export type PersonKind = 'student' | 'staff';

export const ROSTER_FIELDS = [
  'name', 'fatherName', 'motherName', 'dob', 'class', 'section', 'rollNo', 'admissionNo', 'bloodGroup',
  'phone', 'address', 'route', 'session', 'employeeId', 'designation', 'department', 'qualification',
] as const;
export type RosterField = (typeof ROSTER_FIELDS)[number];

export const KIND_FIELDS: Record<PersonKind, RosterField[]> = {
  student: ['name', 'fatherName', 'motherName', 'dob', 'class', 'section', 'rollNo', 'admissionNo', 'bloodGroup', 'phone', 'address', 'route', 'session'],
  staff: ['name', 'employeeId', 'designation', 'department', 'qualification', 'fatherName', 'dob', 'bloodGroup', 'phone', 'address', 'session'],
};

export const FIELD_LABELS: Record<RosterField, string> = {
  name: 'Name',
  fatherName: "Father's name",
  motherName: "Mother's name",
  dob: 'Date of birth',
  class: 'Class',
  section: 'Section',
  rollNo: 'Roll no.',
  admissionNo: 'Admission no.',
  bloodGroup: 'Blood group',
  phone: 'Phone',
  address: 'Address',
  route: 'Bus route',
  session: 'Session',
  employeeId: 'Employee ID',
  designation: 'Designation',
  department: 'Department',
  qualification: 'Qualification',
};

export type Person = { _id: string; code: string; kind: PersonKind; hasPhoto: boolean; photoUrl?: string; photoSource?: string } & Partial<
  Record<RosterField, string>
>;

export interface ImportResult {
  created: number;
  updated: number;
  photos: number;
  skipped: { row: number; reason: string }[];
  unknownColumns: string[];
}

export const rosterBase = (institutionId: string) => `/admin/institutions/${institutionId}/roster`;

export function useRoster(institutionId: string, kind: PersonKind) {
  return useQuery({
    queryKey: ['admin-roster', institutionId, kind],
    queryFn: async () => (await api.get<{ items: Person[]; total: number; withPhoto: number }>(rosterBase(institutionId), { params: { kind } })).data,
    // Photo links are signed for an hour.
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
  });
}

async function upload(file: File) {
  const { data: presign } = await api.post<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>('/uploads/presign', {
    fileName: file.name,
    mimeType: file.type || (file.name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream'),
    size: file.size,
    purpose: 'roster',
  });
  await axios.put(presign.uploadUrl, file, { headers: presign.headers });
  await api.post(`/uploads/${presign.fileId}/complete`);
  return presign.fileId;
}

export function useRosterActions(institutionId: string) {
  const queryClient = useQueryClient();
  const base = rosterBase(institutionId);
  const done = { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-roster', institutionId] }) };
  return {
    save: useMutation({
      mutationFn: async ({ id, kind, fields }: { id?: string; kind: PersonKind; fields: Partial<Record<RosterField, string>> }) =>
        id ? (await api.patch<Person>(`${base}/${id}`, fields)).data : (await api.post<Person>(base, { kind, ...fields })).data,
      ...done,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`${base}/${id}`), ...done }),
    setPhoto: useMutation({
      mutationFn: async ({ person, blob, source }: { person: Person; blob: Blob; source: 'upload' | 'camera' }) => {
        const fileId = await upload(new File([blob], `${person.code}.jpg`, { type: 'image/jpeg' }));
        return (await api.put<Person>(`${base}/${person._id}/photo`, { fileId, source })).data;
      },
      ...done,
    }),
    importSheet: useMutation({
      mutationFn: async ({ kind, sheet, photos }: { kind: PersonKind; sheet: File; photos?: File | null }) => {
        const [fileId, photosFileId] = await Promise.all([upload(sheet), photos ? upload(photos) : Promise.resolve(undefined)]);
        return (await api.post<ImportResult>(`${base}/import`, { kind, fileId, photosFileId })).data;
      },
      ...done,
    }),
  };
}
