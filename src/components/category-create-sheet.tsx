import { useSQLiteContext } from 'expo-sqlite';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner-native';

import { CATEGORY_COLORS } from '@/catalog/categories';
import { useLiveQuery } from '@/db/events';
import { createCategory, listCategories } from '@/db/repo';
import type { CategoryKind } from '@/db/types';
import { haptic } from '@/lib/haptics';

import { CategoryFields, type CategoryDraft } from './category-fields';
import { categoryIcon } from './icons';
import { Button, Sheet, type SheetRef } from './ui';

export type CategoryCreateRef = { open: (name: string, kind: CategoryKind) => void };

/**
 * "New category" as a sheet over the category chooser: the full form (preview, name, kind, icon, colour)
 * with the typed name filled in. Names are unique per kind ignoring case: a clash says so under the name
 * and offers the existing one instead. `onCreated` gets the id of the category to select.
 */
export const CategoryCreateSheet = forwardRef<CategoryCreateRef, { onCreated: (id: string) => void }>(function CategoryCreateSheet(
  { onCreated },
  ref
) {
  const db = useSQLiteContext();
  const sheet = useRef<SheetRef>(null);
  const { data: categories } = useLiveQuery(listCategories, ['categories']);
  const [draft, setDraft] = useState<CategoryDraft>({ name: '', kind: 'expense', icon: 'bag', color: CATEGORY_COLORS[0] });
  const [busy, setBusy] = useState(false);

  useImperativeHandle(ref, () => ({
    open: (name, kind) => {
      const n = name.trim();
      // Start from the icon the name suggests and the next colour in the palette.
      setDraft({ name: n, kind, icon: categoryIcon(n, kind, null), color: CATEGORY_COLORS[(categories?.length ?? 0) % CATEGORY_COLORS.length] });
      sheet.current?.present();
    },
  }));

  const typed = draft.name.trim().replace(/\s+/g, ' ');
  const clash = typed ? categories?.find((c) => c.kind === draft.kind && c.name.toLowerCase() === typed.toLowerCase()) : undefined;

  const done = (id: string) => {
    sheet.current?.dismiss();
    onCreated(id);
  };

  const add = async () => {
    if (!typed || clash || busy) return;
    setBusy(true);
    try {
      const id = await createCategory(db, typed, draft.kind, { icon: draft.icon, color: draft.color });
      haptic.success();
      toast.success(`${typed} added`);
      done(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      ref={sheet}
      title="New category"
      scrollable
      lazy
      footer={<Button size="lg" title={clash ? 'Already exists' : 'Add category'} disabled={!typed || !!clash} loading={busy} onPress={add} />}>
      <CategoryFields
        value={draft}
        onChange={setDraft}
        autoFocus={!draft.name}
        error={clash ? `There’s already a ${clash.kind} category called “${clash.name}”.` : null}
        errorAction={
          clash ? <Button size="sm" variant="tinted" title={`Use “${clash.name}”`} onPress={() => done(clash.id)} className="self-start" /> : null
        }
      />
    </Sheet>
  );
});
