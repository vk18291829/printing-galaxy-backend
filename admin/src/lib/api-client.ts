import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore, type StaffSession } from '@/features/auth/auth-store';

// Defaults to the API on the same host the page was opened from (localhost, 127.0.0.1 or a LAN IP).
export const API_URL = import.meta.env.VITE_API_URL ?? `${window.location.protocol}//${window.location.hostname}:4000/api/v1`;

export const api = axios.create({ baseURL: API_URL, withCredentials: true, timeout: 30_000 });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<StaffSession | null> | null = null;

/** Admin uses its own refresh cookie, so it can stay signed in alongside the website. */
export function refreshSession() {
  refreshPromise ??= axios
    .post<StaffSession>(`${API_URL}/auth/staff/refresh`, null, { withCredentials: true })
    .then((res) => {
      useAuthStore.getState().setSession(res.data);
      return res.data;
    })
    .catch(() => {
      useAuthStore.getState().clear();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  if (error.response?.status === 401 && original && !original._retried && !original.url?.startsWith('/auth/')) {
    original._retried = true;
    if (await refreshSession()) return api(original);
  }
  return Promise.reject(error);
});

export function getErrorMessage(error: unknown, fallback = 'Something went wrong') {
  if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
    if (!error.response) return 'Network error. Is the API running?';
    return error.response.data?.error?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
