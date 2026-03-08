'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Project {
  id: number;
  name: string;
  path: string;
  last_indexed: number | null;
  fileCount: number;
  symbolCount: number;
}

const FONT = 'var(--font-inter, "Inter", system-ui, -apple-system, sans-serif)';

// Near-pure-black palette — no warm tones, no saturation
const C = {
  bg:       '#0a0a0a',
  surface:  '#111111',
  surfaceHov: '#161616',
  border:   'rgba(255,255,255,0.07)',
  borderHov:'rgba(255,255,255,0.13)',
  text:     '#ededed',
  muted:    '#888888',
  subtle:   '#4d4d4d',
  link:     '#3291ff',
} as const;

function shortenPath(p: string) {
  return p.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: Project[]) => { setProjects(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONT, fontSize: '13px', lineHeight: '20px' }}>

      {/* ── Top bar ── */}
      <header style={{
        height: '48px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 20px',
        position: 'sticky', top: 0, zIndex: 50,
        background: C.bg,
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '20px', height: '20px', borderRadius: '4px',
              background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '9px', fontWeight: 800, color: '#000', letterSpacing: '-0.02em', flexShrink: 0,
            }}>OW</div>
            <span style={{ fontSize: '13px', fontWeight: 500, color: C.text, letterSpacing: '-0.01em' }}>open-wiki</span>
          </div>
          <span style={{ fontSize: '12px', color: C.subtle, fontFamily: FONT }}>
            Run <code style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '3px', color: C.muted }}>ow &lt;path&gt;</code> to index a project
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* Section heading */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '13px', fontWeight: 500, color: C.muted, margin: 0, letterSpacing: '0' }}>
            Projects
            {!loading && projects.length > 0 && (
              <span style={{
                marginLeft: '7px', fontSize: '11px', fontWeight: 500,
                background: 'rgba(255,255,255,0.08)', color: C.muted,
                padding: '1px 6px', borderRadius: '9999px',
              }}>{projects.length}</span>
            )}
          </h1>
        </div>

        {/* Grid */}
        {loading ? (
          <SkeletonGrid />
        ) : projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1px' }}>
            {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: Project }) {
  const [hovered, setHovered] = useState(false);

  const shortPath = shortenPath(project.path);
  const lastIndexed = project.last_indexed
    ? formatDistanceToNow(new Date(project.last_indexed), { addSuffix: true })
    : 'never';
  const initial = project.name[0].toUpperCase();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? C.surfaceHov : C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '6px',
        padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '12px',
        transition: 'background 150ms ease',
        cursor: 'default',
      }}
    >
      {/* Icon + name row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{
          width: '32px', height: '32px', flexShrink: 0,
          borderRadius: '6px',
          background: 'rgba(255,255,255,0.06)',
          border: `1px solid rgba(255,255,255,0.1)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 600, color: C.muted,
        }}>{initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: C.text, letterSpacing: '-0.01em', marginBottom: '2px' }}>
            {project.name}
          </div>
          <div style={{
            fontSize: '11px', color: C.subtle, fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{shortPath}</div>
        </div>
      </div>

      {/* CTA link */}
      <Link
        href={`/docs/${project.name}/wiki`}
        style={{ fontSize: '12px', color: C.link, textDecoration: 'none', display: 'block' }}
        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
      >
        Open Docs →
      </Link>

      {/* Bottom row: stats + date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <span style={{ fontSize: '11px', color: C.subtle }}>
          {project.fileCount} files · {project.symbolCount.toLocaleString()} symbols
        </span>
        <span style={{ fontSize: '11px', color: C.subtle }}>{lastIndexed}</span>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: '8px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '8px',
        background: C.surface, border: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '16px', color: C.subtle,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <p style={{ fontSize: '13px', fontWeight: 500, color: C.text, margin: '0 0 6px' }}>No projects yet</p>
      <p style={{ fontSize: '12px', color: C.muted, margin: '0 0 20px', lineHeight: '18px' }}>
        Run <code style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '3px' }}>ow .</code> in any codebase to get started.
      </p>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: '5px', padding: '7px 14px',
        fontFamily: 'monospace', fontSize: '12px', color: C.muted,
      }}>
        ow /path/to/project
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1px' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ height: '120px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', opacity: 0.5 }} />
      ))}
    </div>
  );
}
