#!/usr/bin/env node
/**
 * Bulk-adds Svyasa 2nd year students directly to the KV store by calling
 * the production admin API endpoint.
 * 
 * Usage:
 *   ADMIN_SECRET=your_secret node scripts/bulk-add-svyasa.mjs
 */

const BASE_URL = process.env.BASE_URL || 'https://opensource-nst-tracker.vercel.app';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error('ADMIN_SECRET env var is required.');
  console.error('   Usage: ADMIN_SECRET=xxx node scripts/bulk-add-svyasa.mjs');
  process.exit(1);
}

const students = [
  "uniquepersun","AbhijitSaha-coder","Abhi-lab645","Akshaysisodia25","anant2526","achavan7",
  "sasanubhav8873","Apishrana","archiiphobic","uvix9","sharkie1604","AryanPatel-ui",
  "ashmita-kamath","Asmitha-M-2006","atulvjd","iDarkster","bhavesh-210","bibhukesh22",
  "bikash-sys","krish29-RJ","Ar1es-XD","debangshuuu","devx099","Dhashamireddy",
  "dhiraj-143r","zenowinged","divynst-png","2102508744-png","geetxnshgoyal",
  "harshitchand998-ai","dokjawho","2102508754-sudo","Rishitjain06","jothinkumar",
  "KartikManmode","krishnachaurasia2k","Layyzyy","liyamanik-007","luvyarana",
  "Mahaveerjain-18","techmahibot","2102508768-anas","NamahOmprakash","2102508725-hash",
  "nayanraj864-cmyk","nithyarajmudhaliyar","Paheli20067","parijat-091","waaiz16",
  "2102508780-netizen","pranavchoudhary-tech","appu-patty","prateek6789-ai","raajpatre",
  "adhikaryrachana00428-hash","Hell-maker07","ravisharma-09","Sadiqua-Parween",
  "Sahitya0805","Sainyy56","sakshamkr0806","ihsksa","samratsharma511-cmyk",
  "Samriddhi-20619","sanskritijain0206-code","SanthoshChevuri-444","sathwik-ace-69",
  "saurabhyuvi14-ai","Shaaz-55","Spidey7770","shivansh-gaurav","SHIVANSH-ux-ys",
  "codestack469","Shreyaagrawal29","TheShadowWalker11","Sid2676","SidharthxNST",
  "Soham9181","Srishti-Nagpure","iamgsrujana-png","sujanyd","k-sumayya",
  "UtsavDoye20122005","sharmavikas18"
];

let added = 0;
let skipped = 0;
let failed = 0;

for (const github of students) {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET,
      },
      body: JSON.stringify({ github, year: '2nd year', campus: 'SVYASA' }),
    });

    const data = await res.json();

    if (res.ok && data.ok) {
      console.log(`  Added:   ${github}`);
      added++;
    } else if (data.message?.includes('already in the list')) {
      console.log(`  Skip:    ${github} (already exists)`);
      skipped++;
    } else {
      console.log(`  Failed:  ${github} — ${JSON.stringify(data)}`);
      failed++;
    }

    // Small delay to avoid hammering the server
    await new Promise(r => setTimeout(r, 150));
  } catch (err) {
    console.error(`  Error for ${github}:`, err.message);
    failed++;
  }
}

console.log(`\n=== Summary ===`);
console.log(`  Added:   ${added}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Failed:  ${failed}`);
