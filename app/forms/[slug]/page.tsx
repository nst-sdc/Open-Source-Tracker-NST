import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getForm } from '@/lib/kv-forms';
import { FormRenderer } from '../FormRenderer';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const def = await getForm(slug);
  if (!def) return { title: 'Form · NST Open Source Tracker' };
  return { title: `${def.title} · NST Open Source Tracker`, description: def.intro, openGraph: { title: def.title, description: def.intro } };
}

export default async function FormPage({ params }: Props) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) notFound();
  const def = await getForm(slug);
  if (!def) notFound();
  const { title, subtitle, intro, bullets, thanks, thanksNote, fields, open } = def;
  return <FormRenderer slug={slug} initial={{ slug, title, subtitle, intro, bullets, thanks, thanksNote, fields, open }} />;
}
