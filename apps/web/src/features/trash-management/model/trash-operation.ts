export type TrashItem = Readonly<{
  id: string;
  kind: 'page' | 'project';
  title: string;
}>;

export type TrashOperation = Readonly<{
  item: TrashItem;
  type: 'purge' | 'restore';
}>;
