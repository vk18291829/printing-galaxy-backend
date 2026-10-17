import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface SmsTemplate {
  _id: string;
  name: string;
  msg91TemplateId: string;
  /** DLT text with {#var#} placeholders. */
  text: string;
  createdAt: string;
}

export type SmsTemplateInput = Pick<SmsTemplate, 'name' | 'msg91TemplateId' | 'text'>;

export interface Campaign {
  _id: string;
  channel: 'email' | 'sms';
  /** Email subject, or SMS template name. */
  title: string;
  text: string;
  link?: string;
  status: 'sending' | 'sent' | 'failed' | 'stopped';
  total: number;
  sent: number;
  failed: number;
  error?: string;
  createdBy?: { _id: string; name: string };
  createdAt: string;
  finishedAt?: string;
}

export interface PromoOverview {
  channel: 'email' | 'sms';
  configured: boolean;
  audience: number;
  insideWindow: boolean;
}

export interface EmailPromoInput {
  subject: string;
  message: string;
  link?: string;
  buttonLabel?: string;
}

export interface SmsPromoInput {
  templateId: string;
  params: string[];
}

const BASE = '/admin/marketing/promotions';
const KEY = ['admin-promotions'] as const;

export const VAR_RE = /\{#var#\}/gi;
export const countVars = (text: string) => text.match(VAR_RE)?.length ?? 0;
export const fillTemplate = (text: string, params: string[]) => {
  let i = 0;
  return text.replace(VAR_RE, () => params[i++] || '…');
};

export function usePromoOverview() {
  return useQuery({ queryKey: [...KEY, 'overview'], queryFn: async () => (await api.get<PromoOverview>(`${BASE}/overview`)).data, refetchInterval: 60_000 });
}

export function useSmsTemplates(enabled: boolean) {
  return useQuery({ queryKey: [...KEY, 'templates'], queryFn: async () => (await api.get<SmsTemplate[]>(`${BASE}/templates`)).data, enabled });
}

export function useCampaigns() {
  return useQuery({
    queryKey: [...KEY, 'campaigns'],
    queryFn: async () => (await api.get<Campaign[]>(`${BASE}/campaigns`)).data,
    // Poll while a campaign is going out.
    refetchInterval: (q) => (q.state.data?.some((c) => c.status === 'sending') ? 3000 : false),
  });
}

function usePromoMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }) });
}

export const useSaveSmsTemplate = () => usePromoMutation((data: SmsTemplateInput) => api.post(`${BASE}/templates`, data));
export const useDeleteSmsTemplate = () => usePromoMutation((id: string) => api.delete(`${BASE}/templates/${id}`));
/** `to` is an email address on the email channel, a mobile number on SMS. */
export const useTestPromo = () =>
  useMutation({ mutationFn: (data: (EmailPromoInput | SmsPromoInput) & { to: string }) => api.post(`${BASE}/test`, data) });
export const useSendCampaign = () =>
  usePromoMutation((data: EmailPromoInput | SmsPromoInput) => api.post<Campaign>(`${BASE}/campaigns`, data).then((r) => r.data));
