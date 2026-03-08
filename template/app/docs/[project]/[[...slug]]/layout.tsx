import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '../../../../lib/source';
import type { PageTree } from 'fumadocs-core/server';

interface Props {
  children: ReactNode;
  params: Promise<{ project: string }>;
}

export default async function Layout({ children, params }: Props) {
  const { project } = await params;

  const projectFolder = source.pageTree.children.find(
    (node): node is PageTree.Folder =>
      node.type === 'folder' && node.name === project
  );

  const tree: PageTree.Root = projectFolder
    ? { ...source.pageTree, children: projectFolder.children }
    : source.pageTree;

  return (
    <DocsLayout
      tree={tree}
      nav={{
        title: project,
        url: `http://localhost:8383`,
      }}
    >
      {children}
    </DocsLayout>
  );
}
