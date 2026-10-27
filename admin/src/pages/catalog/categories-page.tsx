import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { confirmAction } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { IconPicker } from '@/components/common/icon-picker';
import { ErrorState, PageHeader, PageLoader, Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminCategories, useDeleteCategory, useSaveCategory, type AdminCategory, type CategoryInput } from '@/features/catalog/api';
import { ImageListEditor } from '@/features/catalog/components/image-list-editor';

const EMPTY: CategoryInput = {
  name: { en: '', hi: '' },
  slug: '',
  description: { en: '', hi: '' },
  icon: 'printer',
  audiences: ['retail', 'institution'],
  sortOrder: 0,
  isActive: true,
};

function CategoryDialog({ category, onClose }: { category: AdminCategory | 'new'; onClose: () => void }) {
  const save = useSaveCategory();
  const [form, setForm] = useState<CategoryInput>(() =>
    category === 'new'
      ? EMPTY
      : {
          name: { en: category.name.en, hi: category.name.hi ?? '' },
          slug: category.slug,
          description: { en: category.description?.en ?? '', hi: category.description?.hi ?? '' },
          icon: category.icon,
          imageUrl: category.imageUrl ?? '',
          audiences: category.audiences,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        },
  );
  const set = <K extends keyof CategoryInput>(k: K, v: CategoryInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleAudience = (a: 'retail' | 'institution', on: boolean) =>
    set('audiences', on ? [...new Set([...form.audiences, a])] : form.audiences.filter((x) => x !== a));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{category === 'new' ? 'New category' : 'Edit category'}</DialogTitle>
          <DialogDescription>Categories group products in the website menu and on the home page.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name (English)</Label>
            <Input value={form.name.en} onChange={(e) => set('name', { ...form.name, en: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>नाम (Hindi)</Label>
            <Input value={form.name.hi} onChange={(e) => set('name', { ...form.name, hi: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Slug</Label>
            <Input value={form.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} />
          </div>
          <div className="space-y-1.5">
            <Label>Sort order</Label>
            <Input type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Description (English)</Label>
            <Input value={form.description.en} onChange={(e) => set('description', { ...form.description, en: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>विवरण (Hindi)</Label>
            <Input value={form.description.hi} onChange={(e) => set('description', { ...form.description, hi: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Cover image</Label>
            <ImageListEditor value={form.imageUrl ? [form.imageUrl] : []} onChange={(urls) => set('imageUrl', urls[0] ?? '')} max={1} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="category-icon">Icon</Label>
            <IconPicker id="category-icon" value={form.icon} onChange={(name) => set('icon', name)} />
          </div>
          <fieldset className="space-y-2.5 rounded-lg shadow-card p-3">
            <legend className="px-1 text-sm font-medium">Shown to</legend>
            {(['retail', 'institution'] as const).map((a) => (
              <label key={a} className="flex items-center gap-2.5 text-sm">
                <Checkbox checked={form.audiences.includes(a)} onCheckedChange={(v) => toggleAudience(a, v === true)} />
                {a === 'retail' ? 'Individuals' : 'Institutions'}
              </label>
            ))}
          </fieldset>
          <fieldset className="rounded-lg shadow-card p-3">
            <legend className="px-1 text-sm font-medium">Visibility</legend>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">{form.isActive ? 'Active' : 'Hidden'}</span>
                <span className="block text-xs text-muted-foreground">
                  {form.isActive ? 'Shown on the website' : 'Not shown on the website'}
                </span>
              </span>
              <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} aria-label="Active" />
            </label>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending || !form.name.en || !form.slug}
            onClick={async () => {
              const isNew = category === 'new';
              const ok = await confirmAction({
                title: isNew ? `Create “${form.name.en}”?` : `Save changes to “${form.name.en}”?`,
                description: form.isActive ? 'It will show on the website menu and home page right away.' : 'It stays hidden from the website until you switch it on.',
                confirmLabel: isNew ? 'Create category' : 'Save changes',
                action: () => save.mutateAsync({ id: isNew ? undefined : category._id, data: form }),
                successTitle: isNew ? 'Category created' : 'Category updated',
              });
              if (ok) onClose();
            }}
          >
            {save.isPending && <Spinner className="size-4 text-current" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CategoriesPage() {
  const { data, isLoading, error, refetch } = useAdminCategories();
  const remove = useDeleteCategory();
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null);

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Groups shown on the website menu and home page."
        actions={
          <Button onClick={() => setEditing('new')}>
            <IconPlus /> New category
          </Button>
        }
      />
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Category</TableHead>
              <TableHead className="hidden md:table-cell">Slug</TableHead>
              <TableHead className="hidden sm:table-cell">Shown to</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((c) => (
              <TableRow key={c._id}>
                <TableCell className="pl-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <DynamicIcon name={c.icon} className="size-5" />
                    </span>
                    <div>
                      <p className="font-medium">{c.name.en}</p>
                      <p className="text-xs text-muted-foreground">{c.name.hi}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden font-mono text-xs md:table-cell">{c.slug}</TableCell>
                <TableCell className="hidden space-x-1 sm:table-cell">
                  {c.audiences.map((a) => (
                    <Badge key={a} variant="outline">
                      {a === 'retail' ? 'Individuals' : 'Institutions'}
                    </Badge>
                  ))}
                </TableCell>
                <TableCell>{c.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Hidden</Badge>}</TableCell>
                <TableCell className="pr-5 text-right">
                  <Button variant="outline" size="sm" onClick={() => setEditing(c)}>
                    <IconPencil /> Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    
                    aria-label={`Delete ${c.name.en}`}
                    onClick={() =>
                      void confirmAction({
                        tone: 'danger',
                        title: `Delete “${c.name.en}”?`,
                        description: 'This cannot be undone. Categories that still have products cannot be deleted — move or hide those products first.',
                        confirmLabel: 'Delete category',
                        action: () => remove.mutateAsync(c._id),
                        successTitle: 'Category deleted',
                      })
                    }
                  >
                    <IconTrash />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editing && <CategoryDialog category={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
