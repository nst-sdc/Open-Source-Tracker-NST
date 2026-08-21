import { readFileSync } from 'fs';
import { join } from 'path';
import type { EventItem } from './types';
export type { EventItem };

export interface Program {
  name: string;
  year?: number;
  org?: string;
  url?: string;
  /** Project title, e.g. "TensorMap" — distinct from the org name */
  project?: string;
  description?: string;
}

export interface PersonEntry {
  github: string;
  name?: string;
  headline?: string;
  bookingUrl?: string;
  linkedinUrl?: string;
  programs: Program[];
}

function readEntries(filename: string): PersonEntry[] {
  try {
    const content = readFileSync(join(process.cwd(), 'data', filename), 'utf-8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export const getAchievers = () => readEntries('achievers.json');

// ─── Events ───────────────────────────────────────────────────────────────────

export function getEvents(): EventItem[] {
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'events.json'), 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function getEntry(filename: string, username: string): PersonEntry | undefined {
  return readEntries(filename).find(
    (e) => e.github.toLowerCase() === username.toLowerCase()
  );
}

// ─── Program styling ──────────────────────────────────────────────────────────

interface ProgramMeta {
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
}

const PROGRAM_MAP: Record<string, ProgramMeta> = {
  'GSoC':               { label: 'Google Summer of Code',        color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    dot: 'bg-blue-400'    },
  'Summer of Bitcoin':  { label: 'Summer of Bitcoin',            color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  dot: 'bg-orange-400'  },
  'ESoC':               { label: "EddieHub Summer of Code",      color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     dot: 'bg-red-400'     },
  'Outreachy':          { label: 'Outreachy Internships',        color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/30',   dot: 'bg-green-400'   },
  'LFX':                { label: 'Linux Foundation Mentorship',  color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  dot: 'bg-violet-400'  },
  'MLH':                { label: 'Major League Hacking',         color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    dot: 'bg-rose-400'    },
  'Hacktoberfest':      { label: 'Hacktoberfest',                color: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/30',    dot: 'bg-pink-400'    },
};

export function getProgramMeta(name: string): ProgramMeta {
  return (
    PROGRAM_MAP[name] ?? {
      label: name,
      color: 'text-white/60',
      bg: 'bg-white/5',
      border: 'border-white/15',
      dot: 'bg-white/40',
    }
  );
}
