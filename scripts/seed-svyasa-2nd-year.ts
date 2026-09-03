/**
 * One-time script: bulk-add Svyasa 2nd year students directly to KV.
 * Run with: npx tsx scripts/seed-svyasa-2nd-year.ts
 */

// We import the KV helpers directly — this runs in the Node.js environment
// with VERCEL_KV_* env vars set from .env.local

import { addStudent } from '../lib/kv-students';

const students: Array<{ github: string }> = [
  { github: 'uniquepersun' },
  { github: 'AbhijitSaha-coder' },
  { github: 'Abhi-lab645' },
  { github: 'Akshaysisodia25' },
  { github: 'anant2526' },
  { github: 'achavan7' },
  { github: 'sasanubhav8873' },
  { github: 'Apishrana' },
  { github: 'archiiphobic' },
  { github: 'uvix9' },
  { github: 'sharkie1604' },
  { github: 'AryanPatel-ui' },
  { github: 'ashmita-kamath' },
  { github: 'Asmitha-M-2006' },
  { github: 'atulvjd' },
  { github: 'iDarkster' },
  { github: 'bhavesh-210' },
  { github: 'bibhukesh22' },
  { github: 'bikash-sys' },
  { github: 'krish29-RJ' },
  { github: 'Ar1es-XD' },
  { github: 'debangshuuu' },
  { github: 'devx099' },
  { github: 'Dhashamireddy' },
  { github: 'dhiraj-143r' },
  { github: 'zenowinged' },
  { github: 'divynst-png' },
  { github: '2102508744-png' },
  { github: 'geetxnshgoyal' },
  { github: 'harshitchand998-ai' },
  { github: 'dokjawho' },
  { github: '2102508754-sudo' },
  { github: 'Rishitjain06' },
  { github: 'jothinkumar' },
  { github: 'KartikManmode' },
  { github: 'krishnachaurasia2k' },
  { github: 'Layyzyy' },
  { github: 'liyamanik-007' },
  { github: 'luvyarana' },
  { github: 'Mahaveerjain-18' },
  { github: 'techmahibot' },
  { github: '2102508768-anas' },
  { github: 'NamahOmprakash' },
  { github: '2102508725-hash' },
  { github: 'nayanraj864-cmyk' },
  { github: 'nithyarajmudhaliyar' },
  { github: 'Paheli20067' },
  { github: 'parijat-091' },
  { github: 'waaiz16' },
  { github: '2102508780-netizen' },
  { github: 'pranavchoudhary-tech' },
  { github: 'appu-patty' },
  { github: 'prateek6789-ai' },
  { github: 'raajpatre' },
  { github: 'adhikaryrachana00428-hash' },
  { github: 'Hell-maker07' },
  { github: 'ravisharma-09' },
  { github: 'Sadiqua-Parween' },
  { github: 'Sahitya0805' },
  { github: 'Sainyy56' },
  { github: 'sakshamkr0806' },
  { github: 'ihsksa' },
  { github: 'samratsharma511-cmyk' },
  { github: 'Samriddhi-20619' },
  { github: 'sanskritijain0206-code' },
  { github: 'SanthoshChevuri-444' },
  { github: 'sathwik-ace-69' },
  { github: 'saurabhyuvi14-ai' },
  { github: 'Shaaz-55' },
  { github: 'Spidey7770' },
  { github: 'shivansh-gaurav' },
  { github: 'SHIVANSH-ux-ys' },
  { github: 'codestack469' },
  { github: 'Shreyaagrawal29' },
  { github: 'TheShadowWalker11' },
  { github: 'Sid2676' },
  { github: 'SidharthxNST' },
  { github: 'Soham9181' },
  { github: 'Srishti-Nagpure' },
  { github: 'iamgsrujana-png' },
  { github: 'sujanyd' },
  { github: 'k-sumayya' },
  { github: 'UtsavDoye20122005' },
  { github: 'sharmavikas18' },
];

let added = 0, skipped = 0, failed = 0;

async function main() {
  for (const { github } of students) {
    const result = await addStudent(github, '2nd year', 'SVYASA');
    if (result.ok) {
      console.log(`  Added:   ${github}`);
      added++;
    } else if (result.message?.includes('already')) {
      console.log(`  Skip:    ${github}`);
      skipped++;
    } else {
      console.log(`  Failed:  ${github} — ${result.message}`);
      failed++;
    }
  }
  console.log(`\nDone — Added: ${added}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch(console.error);

