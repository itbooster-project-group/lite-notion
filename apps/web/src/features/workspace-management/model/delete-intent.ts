export type PageDeleteRequest = Readonly<{
  pageId: string;
  returnFocus: HTMLElement | undefined;
  title: string;
}>;

export type ProjectDeleteRequest = Readonly<{
  name: string;
  projectId: string;
  returnFocus: HTMLElement | undefined;
}>;
