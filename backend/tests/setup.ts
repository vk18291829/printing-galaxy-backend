import { vi } from 'vitest';

vi.mock('@/modules/uploads/storage', async () => import('./memory-storage'));
