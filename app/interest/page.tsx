import type { Metadata } from 'next';
import { getForm } from '@/lib/kv-forms';
import { FormRenderer } from '../forms/FormRenderer';

export const dynamic = 'force-dynamic';

/** The open-source interest form: the built-in form definition "interest", at the short link students were given. */
export async function generateMetadata(): Promise<Metadata> {
  const def = await getForm('interest');
  const title = def?.title ?? 'Open Source Interest Form';
  const description = def?.intro ?? 'Register your interest in open source at NST.';
  return { title: `${title} · NST Open Source Tracker`, description, openGraph: { title, description } };
}

export default async function InterestPage() {
  const def = await getForm('interest');
  const initial = def ? { slug: def.slug, title: def.title, subtitle: def.subtitle, intro: def.intro, bullets: def.bullets, thanks: def.thanks, thanksNote: def.thanksNote, fields: def.fields, open: def.open } : undefined;
  return <FormRenderer slug="interest" initial={initial} />;
}
