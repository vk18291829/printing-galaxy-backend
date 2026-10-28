import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadFile } from '@/features/uploads/upload-file';
import { api } from '@/lib/api-client';

export type PersonKind = 'student' | 'staff';

export const ROSTER_FIELDS = [
  'name', 'fatherName', 'motherName', 'dob', 'class', 'section', 'rollNo', 'admissionNo', 'bloodGroup',
  'phone', 'address', 'route', 'session', 'employeeId', 'designation', 'department', 'qualification',
] as const;
export type RosterField = (typeof ROSTER_FIELDS)[number];

/** Fields shown for each kind, in form and table order (same as the API's export). */
export const KIND_FIELDS: Record<PersonKind, RosterField[]> = {
  student: ['name', 'fatherName', 'motherName', 'dob', 'class', 'section', 'rollNo', 'admissionNo', 'bloodGroup', 'phone', 'address', 'route', 'session'],
  staff: ['name', 'employeeId', 'designation', 'department', 'qualification', 'fatherName', 'dob', 'bloodGroup', 'phone', 'address', 'session'],
};

export type Person = { _id: string; code: string; kind: PersonKind; hasPhoto: boolean; photoUrl?: string; photoSource?: string } & Partial<
  Record<RosterField, string>
>;

export interface RosterList {
  items: Person[];
  total: number;
  withPhoto: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  photos: number;
  skipped: { row: number; reason: string }[];
  unknownColumns: string[];
}

const BASE = '/institution/roster';
const keys = { list: (kind: PersonKind) => ['roster', kind] as const };

export function useRoster(kind: PersonKind) {
  return useQuery({
    queryKey: keys.list(kind),
    queryFn: async () => (await api.get<RosterList>(BASE, { params: { kind } })).data,
    // Photo links are signed for an hour; refresh well before they expire.
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
  });
}

function useRosterMutation<I, O>(fn: (input: I) => Promise<O>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roster'] }) });
}

export const useSavePerson = () =>
  useRosterMutation(async ({ id, kind, fields }: { id?: string; kind: PersonKind; fields: Partial<Record<RosterField, string>> }) =>
    id ? (await api.patch<Person>(`${BASE}/${id}`, fields)).data : (await api.post<Person>(BASE, { kind, ...fields })).data,
  );

export const useDeletePerson = () => useRosterMutation((id: string) => api.delete(`${BASE}/${id}`));

export const useSetPhoto = () =>
  useRosterMutation(async ({ person, blob, source }: { person: Person; blob: Blob; source: 'upload' | 'camera' }) => {
    const file = new File([blob], `${person.code}.jpg`, { type: 'image/jpeg' });
    const uploaded = await uploadFile(file, { purpose: 'roster' });
    return (await api.put<Person>(`${BASE}/${person._id}/photo`, { fileId: uploaded._id, source })).data;
  });

export const useRemovePhoto = () => useRosterMutation((id: string) => api.delete(`${BASE}/${id}/photo`));

export const useImportRoster = () =>
  useRosterMutation(async ({ kind, sheet, photos }: { kind: PersonKind; sheet: File; photos?: File | null }) => {
    const [data, zip] = await Promise.all([
      uploadFile(sheet, { purpose: 'roster' }),
      photos ? uploadFile(photos, { purpose: 'roster' }) : Promise.resolve(null),
    ]);
    return (await api.post<ImportResult>(`${BASE}/import`, { kind, fileId: data._id, photosFileId: zip?._id })).data;
  });

export const rosterExportUrl = (kind: PersonKind) => `${BASE}/export.xlsx?kind=${kind}`;
