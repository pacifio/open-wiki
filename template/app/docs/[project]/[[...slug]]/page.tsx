import { notFound } from 'next/navigation';
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import * as Twoslash from 'fumadocs-twoslash/ui';
import { Mermaid } from '../../../../components/mdx/mermaid';
import { source } from '../../../../lib/source';

interface Props {
  params: Promise<{ project: string; slug?: string[] }>;
}

export default async function DocPage({ params }: Props) {
  const { project, slug = [] } = await params;

  // The docs are nested under /docs/<project>/...
  const page = source.getPage([project, ...slug]);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={{ ...defaultMdxComponents, ...Twoslash, Mermaid }} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}
