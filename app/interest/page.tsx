import type { Metadata } from 'next';
import { InterestForm } from './InterestForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Open Source Interest Form · NST Open Source Tracker',
  description: 'Register your interest in open source at NST. Sign in with GitHub, add your name, email, batch and campus. Takes a minute.',
  openGraph: {
    title: 'Open Source Interest Form',
    description: 'Register your interest in open source at NST. Sign in with GitHub and fill four fields.',
  },
};

export default function InterestPage() {
  return <InterestForm />;
}
