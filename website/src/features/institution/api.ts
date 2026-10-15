import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Address, LocalizedString, Order, OrderStatus, PriceBook, ProductUnit } from '@/types/api';

export type CardKind = 'student_id' | 'teacher_id' | 'out_pass' | 'fee_card';
export type BulkStatus = 'queued' | 'validating' | 'needs_fixes' | 'generating' | 'ready' | 'ordered' | 'failed';

export interface CardKindInfo {
  kind: CardKind;
  label: string;
  productSlug: string;
  idField: string;
  required: string[];
  optional: string[];
  defaultFields: string[];
  photoRequired: boolean;
  size: { w: number; h: number };
  badge: string;
  allowedFields: { key: string; label: string }[];
}

export interface CardTemplate {
  _id: string;
  name: string;
  kind: CardKind;
  orientation: 'landscape' | 'portrait';
  logo?: string;
  logoUrl?: string;
  colors: { primary: string; accent: string; text: string };
  headerText?: string;
  subText?: string;
  fields: string[];
  backText?: string;
  signatureLabel?: string;
  validUpto?: string;
  updatedAt: string;
}

export interface TemplateInput {
  name: string;
  kind: CardKind;
  orientation: 'landscape' | 'portrait';
  logoFileId?: string | null;
  colors: CardTemplate['colors'];
  headerText: string;
  subText: string;
  fields: string[];
  backText: string;
  signatureLabel: string;
  validUpto: string;
}

export interface BulkIssue {
  row?: number;
  field?: string;
  message: string;
}

export interface BulkJob {
  _id: string;
  kind: CardKind;
  status: BulkStatus;
  template?: { _id: string; name: string; kind: CardKind; orientation?: string };
  product?: { _id: string; name: LocalizedString; slug: string; unit: ProductUnit; pricing: Record<'retail' | 'institution', PriceBook> };
  order?: Pick<Order, '_id' | 'orderNumber' | 'status' | 'totals'> & { status: OrderStatus };
  report: {
    rows: number;
    validRows: number;
    photosInZip: number;
    photosMatched: number;
    columns?: string[];
    ignoredColumns?: string[];
    errors?: BulkIssue[];
    warnings?: BulkIssue[];
  };
  output?: { file?: string; sheets?: number; cards?: number; generatedAt?: string };
  dataFile?: { _id: string; originalName: string; size: number };
  photosFile?: { _id: string; originalName: string; size: number };
  preview?: { row: number; data: Record<string, string>; photo?: string }[];
  error?: string;
  createdAt: string;
}

const BUSY: BulkStatus[] = ['queued', 'validating', 'generating'];

export function useCardKinds() {
  return useQuery({
    queryKey: ['card-kinds'],
    queryFn: async () => (await api.get<CardKindInfo[]>('/institution/card-kinds')).data,
    staleTime: Infinity,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get<CardTemplate[]>('/institution/templates')).data,
  });
}

export function useSaveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: TemplateInput }) =>
      (id ? await api.patch<CardTemplate>(`/institution/templates/${id}`, data) : await api.post<CardTemplate>('/institution/templates', data)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/institution/templates/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useBulkJobs() {
  return useQuery({
    queryKey: ['bulk-jobs'],
    queryFn: async () => (await api.get<BulkJob[]>('/institution/bulk-jobs')).data,
    refetchInterval: (q) => (q.state.data?.some((j) => BUSY.includes(j.status)) ? 3000 : false),
  });
}

export function useBulkJob(id: string) {
  return useQuery({
    queryKey: ['bulk-jobs', id],
    queryFn: async () => (await api.get<BulkJob>(`/institution/bulk-jobs/${id}`)).data,
    refetchInterval: (q) => (q.state.data && BUSY.includes(q.state.data.status) ? 2000 : false),
  });
}

export function useCreateBulkJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { templateId: string; dataFileId: string; photosFileId?: string; options?: Record<string, string> }) =>
      (await api.post<BulkJob>('/institution/bulk-jobs', input)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bulk-jobs'] }),
  });
}

export function usePlaceBulkOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fulfilment: { method: 'pickup' | 'delivery'; address?: Address }; paymentMethod: 'online' | 'counter'; customerNote?: string }) =>
      (await api.post<Order>(`/institution/bulk-jobs/${id}/order`, input)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bulk-jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/** A ready-to-fill CSV with the right headings for a card type. */
export function sampleCsv(info: CardKindInfo) {
  const headings: Record<string, string> = {
    name: 'Name', rollNo: 'Roll No', admissionNo: 'Admission No', employeeId: 'Employee ID', class: 'Class', section: 'Section',
    fatherName: "Father's Name", motherName: "Mother's Name", dob: 'DOB', bloodGroup: 'Blood Group', phone: 'Mobile',
    address: 'Address', designation: 'Designation', department: 'Department', session: 'Session', route: 'Bus Route', photo: 'Photo',
  };
  const cols = [...info.required, ...info.optional];
  const example: Record<string, string> = {
    name: info.kind === 'teacher_id' ? 'Meena Gupta' : 'Aarav Sharma', rollNo: '1023', admissionNo: 'A-3381', employeeId: 'T-017',
    class: 'VII', section: 'B', fatherName: 'Rajesh Sharma', motherName: 'Sunita Sharma', dob: '14-03-2013', bloodGroup: 'B+',
    phone: '9876543210', address: '12 Civil Lines', designation: 'PGT Mathematics', department: 'Science', session: '2026-27',
    route: 'Route 4', photo: info.kind === 'teacher_id' ? 'T-017.jpg' : '1023.jpg',
  };
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `﻿${cols.map((c) => esc(headings[c] ?? c)).join(',')}\r\n${cols.map((c) => esc(example[c] ?? '')).join(',')}\r\n`;
}
