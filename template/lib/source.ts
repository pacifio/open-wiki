import { loader } from 'fumadocs-core/source';
import { createMDXSource } from 'fumadocs-mdx';
import { docs, meta } from '../.source';

const mdxSource = createMDXSource(docs, meta);

export const source = loader({
  baseUrl: '/docs',
  // fumadocs-mdx v11 returns files as a function at runtime despite the type saying array
  source: { files: (mdxSource as any).files() } as typeof mdxSource,
});
