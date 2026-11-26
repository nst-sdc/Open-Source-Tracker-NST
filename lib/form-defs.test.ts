import { describe, it, expect } from 'vitest';
import { DEFAULT_FORMS, validateFormDef, validateAnswers, fillTemplate, responsesCsv, rosterDetails, keyify, slugify, type FormResponse } from './form-defs';

const interest = DEFAULT_FORMS[0];

describe('validateFormDef', () => {
  it('accepts the built-in interest form unchanged', () => {
    const r = validateFormDef(interest, '2026-12-01T00:00:00Z');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.def.fields.map((f) => f.key)).toEqual(['name', 'email', 'batch', 'campus', 'channel']);
      expect(r.def.createdAt).toBe(interest.createdAt);
      expect(r.def.updatedAt).toBe('2026-12-01T00:00:00Z');
    }
  });
  it('derives keys from labels, parses comma options, and rejects bad slugs, duplicate keys and roster forms without batch/campus', () => {
    const r = validateFormDef({ slug: 'Hack Day', title: 'Hack day', fields: [{ label: 'Team name' }, { label: 'Track', type: 'select', options: 'Web, ML ,Web' }] });
    expect(r).toMatchObject({ ok: false });
    const ok = validateFormDef({ slug: 'hack-day', title: 'Hack day', fields: [{ label: 'Team name' }, { label: 'Track', type: 'select', options: 'Web, ML ,Web' }] });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.def.fields).toEqual([
      { key: 'team_name', label: 'Team name', type: 'text', required: true },
      { key: 'track', label: 'Track', type: 'select', required: true, options: ['Web', 'ML'] },
    ]);
    expect(validateFormDef({ slug: 'x', title: 'X', fields: [{ label: 'A', key: 'a' }, { label: 'B', key: 'a' }] })).toMatchObject({ ok: false });
    expect(validateFormDef({ slug: 'x', title: 'X', addToRoster: true, fields: [{ label: 'Batch', key: 'batch', type: 'select', options: ['1st year', '2nd year'] }] })).toMatchObject({ ok: false });
    expect(validateFormDef({ slug: 'x', title: 'X', fields: [{ label: 'Pick', type: 'radio', options: ['only one'] }] })).toMatchObject({ ok: false });
    expect(validateFormDef({ slug: 'x', title: 'X', fields: [] })).toMatchObject({ ok: false });
  });
  it('keyify and slugify', () => {
    expect(keyify('Where do you read messages?')).toBe('where_do_you_read_messages');
    expect(keyify('2nd thing')).toBe('f_2nd_thing');
    expect(slugify('Hack Day 2027!')).toBe('hack-day-2027');
  });
});

describe('validateAnswers', () => {
  it('normalises, enforces required fields, email shape and option membership, and drops unknown keys', () => {
    const r = validateAnswers(interest, { name: '  Asha   Rao ', email: ' Asha@Example.EDU ', batch: '2nd year', campus: 'ADYPU', channel: 'WhatsApp', extra: 'x' });
    expect(r).toEqual({ ok: true, answers: { name: 'Asha Rao', email: 'asha@example.edu', batch: '2nd year', campus: 'ADYPU', channel: 'WhatsApp' } });
    const base = { name: 'Asha', email: 'a@b.co', batch: '1st year', campus: 'SMRU', channel: 'Email' };
    expect(validateAnswers(interest, { ...base, name: '' })).toMatchObject({ ok: false, error: 'Enter full name.' });
    expect(validateAnswers(interest, { ...base, email: 'nope' })).toMatchObject({ ok: false });
    expect(validateAnswers(interest, { ...base, batch: '5th year' })).toMatchObject({ ok: false });
    expect(validateAnswers(interest, { ...base, channel: undefined })).toMatchObject({ ok: false, error: 'Choose where do you actually read messages.' });
  });
  it('lets an optional field stay empty', () => {
    const def = { ...interest, fields: [{ key: 'note', label: 'Note', type: 'textarea' as const, required: false }] };
    expect(validateAnswers(def, {})).toEqual({ ok: true, answers: {} });
  });
});

describe('fillTemplate and rosterDetails', () => {
  it('fills first name and field keys', () => {
    expect(fillTemplate("Thank you, {first}. We'll ping you on {channel}.", { name: 'Asha Rao', channel: 'WhatsApp' })).toBe("Thank you, Asha. We'll ping you on WhatsApp.");
    expect(fillTemplate('Hi {first}', {})).toBe('Hi there');
    expect(rosterDetails({ batch: '2nd year', campus: 'Mars' })).toEqual({ year: '2nd year', campus: undefined });
  });
});

describe('responsesCsv', () => {
  it('one column per field, quoted where needed, oldest first', () => {
    const row = (over: Partial<FormResponse>): FormResponse => ({ githubId: 1, github: 'g', answers: { name: 'N', email: 'e@x.io', batch: '1st year', campus: 'SMRU', channel: 'Email' }, createdAt: '2026-11-30T09:00:00Z', updatedAt: '2026-11-30T09:00:00Z', ...over });
    const csv = responsesCsv(interest, [row({ githubId: 2, createdAt: '2026-12-01T00:00:00Z', answers: { name: 'Rao, Asha "AR"', email: 'a@b.co', batch: '2nd year', campus: 'ADYPU', channel: 'WhatsApp' } }), row({})]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('github,name,email,batch,campus,channel,submitted_at,updated_at,github_id');
    expect(lines[1].endsWith(',1')).toBe(true);
    expect(lines[2]).toContain('"Rao, Asha ""AR"""');
  });
});
