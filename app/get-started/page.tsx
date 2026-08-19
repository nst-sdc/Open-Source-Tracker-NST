import Link from 'next/link';
import { guidelines } from '@/lib/contribution-guidelines';

export const metadata = {
  title: 'Get Started — Opensource Tracker NST',
  description: 'Discover how open source powers global tech innovation, explore world-class projects like Linux, Android, VLC, and Python, and learn how to make your first contribution.',
};

const giants = [
  {
    name: 'Linux',
    category: 'Operating System',
    desc: "Powers 100% of the world's top 500 supercomputers, 96.3% of the top 1 million web servers, and forms the core cloud infrastructure of AWS, Azure, and Google Cloud.",
    funFact: 'Did you know? Linus Torvalds created Linux in 1991 as a personal hobby project because he wanted to learn how his computer’s processor worked. Today, it runs every Android phone, the Mars Ingenuity Helicopter, and the cloud servers of AWS, Google, and Azure.',
    impact: 'Bedrock of the Internet',
    keyUsers: 'AWS, NASA, SpaceX, Tesla',
    icon: '🐧',
    color: 'text-blue-400',
    accent: 'border-blue-500/10 hover:border-blue-500/30 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]',
    bg: 'from-blue-500/5 to-transparent',
  },
  {
    name: 'Android',
    category: 'Mobile Platform',
    desc: 'An open-source OS developed by Google and built on the Linux kernel, running on over 3 Billion active smartphones, tablets, TVs, and smartwatches globally.',
    funFact: 'Did you know? Android started as a tiny startup targeting digital cameras. Google acquired it and open-sourced the code under the Android Open Source Project (AOSP). It democratized smartphones, allowing hardware companies worldwide to build on a world-class OS.',
    impact: '3B+ Active Devices',
    keyUsers: 'Samsung, Google, Xiaomi, OnePlus',
    icon: '🤖',
    color: 'text-green-400',
    accent: 'border-green-500/10 hover:border-green-500/30 group-hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]',
    bg: 'from-green-500/5 to-transparent',
  },
  {
    name: 'Python',
    category: 'Programming & AI',
    desc: "The open programming language and neural network library that serves as the absolute backbone for the modern AI boom (powering ChatGPT, Midjourney, and Tesla's FSD).",
    funFact: 'Did you know? Guido van Rossum created Python as a "hobby programming project" over his Christmas holidays in 1989 to keep himself occupied. Today, Python is the foundation of the AI revolution, powering PyTorch, TensorFlow, and ChatGPT\'s backing framework.',
    impact: 'Language of AI',
    keyUsers: 'OpenAI, Meta, NASA, Netflix',
    icon: '🐍',
    color: 'text-yellow-400',
    accent: 'border-yellow-500/10 hover:border-yellow-500/30 group-hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]',
    bg: 'from-yellow-500/5 to-transparent',
  },
  {
    name: 'VLC Media Player',
    category: 'Media Utility',
    desc: 'The universal media player that plays any audio/video format without ads or tracker modules. Developed by volunteers and downloaded over 3.5 Billion times.',
    funFact: 'Did you know? VLC was written in 1996 by French students at École Centrale Paris to stream TV over their dorm network. The developer group VideoLAN kept it 100% free and open. They famously rejected buyout offers worth hundreds of millions of dollars to keep VLC ad-free.',
    impact: '3.5B+ Downloads',
    keyUsers: 'Millions of users globally',
    icon: '🔸',
    color: 'text-orange-400',
    accent: 'border-orange-500/10 hover:border-orange-500/30 group-hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]',
    bg: 'from-orange-500/5 to-transparent',
  },
  {
    name: 'VS Code & Git',
    category: 'Developer Tools',
    desc: 'The code editor and version control engine that are used by over 90% of developers worldwide to write, track, and collaborate on software engineering.',
    funFact: 'Did you know? Linus Torvalds created Git in just 10 days because he was frustrated with existing version control systems. VS Code is built by Microsoft on top of Electron and open-sourced, enabling millions of plugins. Together, they form the global nervous system of coding.',
    impact: 'Industry Standards',
    keyUsers: 'Microsoft, GitHub, Google, Apple',
    icon: '💻',
    color: 'text-purple-400',
    accent: 'border-purple-500/10 hover:border-purple-500/30 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]',
    bg: 'from-purple-500/5 to-transparent',
  },
  {
    name: 'Blender',
    category: '3D & Graphics',
    desc: 'A professional open-source 3D computer graphics suite used in Hollywood blockbusters, visual effects pipelines, indie video games, and virtual reality development.',
    funFact: 'Did you know? When Blender\'s parent company went bankrupt in 2002, the lead developer launched a crowdfunding campaign. The community raised €110,000 in just 7 weeks to buy back the source code and release it open source. Today, it rivals multi-thousand-dollar tools.',
    impact: 'Hollywood-Grade 3D',
    keyUsers: 'Netflix, Ubisoft, EA, NASA',
    icon: '🎨',
    color: 'text-pink-400',
    accent: 'border-pink-500/10 hover:border-pink-500/30 group-hover:shadow-[0_0_20px_rgba(236,72,153,0.15)]',
    bg: 'from-pink-500/5 to-transparent',
  },
];

const benefits = [
  { icon: '🚀', title: 'Real-World Production Experience', desc: 'Work on actual production codebases used by millions of people — a scale you can never replicate in hobby or toy projects.' },
  { icon: '🌐', title: 'Global Portfolio & Visibility', desc: 'Your GitHub profile becomes a living résumé. Tech recruiters actively headhunt developers based on their open source PRs.' },
  { icon: '🤝', title: 'Connect with World-Class Engineers', desc: 'Collaborate and network with software engineers at companies like Google, Meta, Mozilla, and top research labs.' },
  { icon: '🧠', title: 'Deep Technical Onboarding', desc: 'Reading codebase architectures and refactoring according to review comments accelerates your growth faster than any course.' },
  { icon: '💰', title: 'High-Paying Global Programs', desc: 'Prestige programs like GSoC, LFX, Outreachy, and Summer of Bitcoin pay stipends of $3,000 to $6,600+ for summer contributions.' },
  { icon: '📜', title: 'Unquestionable Credibility', desc: 'A merged PR in a major library is absolute proof of code competency, technical patience, and teamwork.' },
];

const onboardingSteps = [
  { n: '1', title: 'Master the Essentials of Git', desc: 'Learn to clone repositories, create descriptive feature branches, commit clean code segments, resolve merge conflicts, and open Pull Requests (PRs).' },
  { n: '2', title: 'Pick a Project You Actually Use', desc: "Start with tools, languages, or libraries in your current stack. If you are learning React, contribute to a React package. Familiarity makes understanding the code 10x easier." },
  { n: '3', title: 'Always Read CONTRIBUTING.md First', desc: 'Every repository outlines strict code formatting, pull request flows, testing procedures, and communication norms. Following this separates top contributors from spam.' },
  { n: '4', title: 'Start with "Good First Issues"', desc: 'Filter GitHub issue queues using labels like "good first issue", "beginner-friendly", or "documentation". These are small, isolated tasks meant for onboarding newcomers.' },
  { n: '5', title: 'Understand the Architecture Before Fixing', desc: 'Read the surrounding code, run the project locally, write failing test cases first to reproduce the bug. A surgical 5-line fix is infinitely better than a sprawling 200-line rewrite.' },
  { n: '6', title: 'Write Clear, Meaningful PR Descriptions', desc: 'Volunteers review your code. Respect their time by explaining what you changed, why, and how to verify it. Include before/after screenshots for UI changes.' },
];

const coreSkills = [
  { title: 'Git & GitHub', items: ['Branching & Forking workflow', 'Rebasing vs. Merging commits', 'Resolving complex conflicts', 'Writing meaningful commit logs', 'Keeping upstream synced'] },
  { title: 'Code Navigation', items: ['Tracing execution paths', 'Reading inline documentations', 'Understanding test suites', 'Using ripgrep / codebase search', 'Navigating large folder structures'] },
  { title: 'Technical Comm', items: ['Writing clear issue bug reports', 'Responding to code reviews', 'Constructing concise questions', 'Explaining architectural choices', 'Constructive developer etiquette'] },
  { title: 'Local Tooling', items: ['Running projects from scratch', 'Using linters and formatters', 'Reading CI/CD logs & workflows', 'Local debugging tools', 'Docker for isolated setups'] },
];

// Canonical source moved to lib/contribution-guidelines.ts — also used by /contribute

export default function GetStartedPage() {
  return (
    <main className="min-h-screen bg-[#030712] text-white relative">
      {/* Visual background lines / grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Hero */}
      <div className="relative overflow-hidden pt-20 pb-16 px-4 border-b border-white/[0.04]">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-0 left-1/4 w-[600px] h-[400px] rounded-full bg-emerald-600/10 blur-[120px]" />
          <div className="absolute top-0 right-1/4 w-[500px] h-[350px] rounded-full bg-blue-600/8 blur-[120px]" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="flex justify-start mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/35 hover:text-white/60 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
              </svg>
              Home
            </Link>
          </div>

          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-400 mb-6">
            ✨ Your Ultimate Open Source Playbook
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 tracking-tight leading-none">
            Get{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-400">
              Started
            </span>
          </h1>
          <p className="text-white/55 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            Open source is the hidden engine powering 99% of global technology. Explore how a shared ecosystem drives unstoppable innovation—and how you can claim your spot in it.
          </p>

          <div className="flex flex-wrap gap-2.5 justify-center mt-10">
            <a href="#what-is-opensource" className="text-xs px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all">
              🌐 What is Open Source?
            </a>
            <a href="#open-source-giants" className="text-xs px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all">
              👑 Open Source Giants
            </a>
            <a href="#why-opensource" className="text-xs px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all">
              🚀 Why Contribute?
            </a>
            <a href="#how-to-start" className="text-xs px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all">
              🪜 Step-by-Step
            </a>
            <a href="#guidelines" className="text-xs px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-all">
              🚫 Rules &amp; Guidelines
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-20 space-y-24">
        {/* Section 1: What is Open Source & Why Innovation */}
        <section id="what-is-opensource" className="space-y-8 scroll-mt-20">
          <div className="bg-white/[0.015] border border-white/[0.05] rounded-3xl p-8 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
            
            <div className="space-y-6">
              <div className="inline-block text-[10px] uppercase font-mono tracking-widest text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 rounded">
                Understanding the movement
              </div>
              <h2 className="text-3xl font-bold text-white tracking-tight">The Global Collaboration Engine</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <div className="md:col-span-2 space-y-4">
                  <p className="text-white/60 leading-relaxed text-sm md:text-base">
                    <strong>What is Open Source?</strong> It is the largest collaborative movement in human history. Instead of working inside private corporate silos, programmers from every continent publish their source code completely in public, allowing anyone to inspect, modify, and improve it.
                  </p>
                  <p className="text-white/60 leading-relaxed text-sm md:text-base">
                    <strong>Why does it drive innovation?</strong> Because it enables <strong>Permissionless Innovation</strong>. Instead of spent developer-years rebuilding database engines, operating systems, or UI components from scratch, engineers build *on top of* rock-solid open utilities. A college student in their dorm room has access to the exact same world-class software infrastructure as Apple, Google, or Netflix.
                  </p>
                </div>
                
                <div className="flex flex-col gap-4">
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 text-center shadow-lg shadow-black/30">
                    <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">99%</div>
                    <div className="text-[10px] text-white/40 font-mono mt-1.5 uppercase tracking-wider">of Modern Codebases</div>
                  </div>
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 text-center shadow-lg shadow-black/30">
                    <div className="text-3xl font-extrabold text-blue-400 tracking-tight">96.3%</div>
                    <div className="text-[10px] text-white/40 font-mono mt-1.5 uppercase tracking-wider">of Web Servers</div>
                  </div>
                </div>
              </div>

              {/* Side-by-side comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/[0.05]">
                <div className="bg-red-500/[0.02] border border-red-500/10 rounded-2xl p-5 relative overflow-hidden">
                  <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
                    <span>🔒</span> Proprietary Silos
                  </h3>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-xs text-white/50">
                      <span className="text-red-400/70 mt-0.5">✕</span>
                      <span><strong>Gatekeeping:</strong> Code is proprietary. You wait on corporate roadmaps for bug fixes.</span>
                    </li>
                    <li className="flex items-start gap-2 text-xs text-white/50">
                      <span className="text-red-400/70 mt-0.5">✕</span>
                      <span><strong>High Fees:</strong> Small teams are locked out due to high software licensing costs.</span>
                    </li>
                    <li className="flex items-start gap-2 text-xs text-white/50">
                      <span className="text-red-400/70 mt-0.5">✕</span>
                      <span><strong>Fragmented:</strong> Every company builds their own closed version of the same basic tools.</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-emerald-500/[0.02] border border-emerald-500/10 rounded-2xl p-5 relative overflow-hidden">
                  <h3 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                    <span>🚀</span> Open Source Paradigm
                  </h3>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-xs text-white/50">
                      <span className="text-emerald-400/70 mt-0.5">✓</span>
                      <span><strong>Collective Intelligence:</strong> Global developers refine, optimize, and test code together.</span>
                    </li>
                    <li className="flex items-start gap-2 text-xs text-white/50">
                      <span className="text-emerald-400/70 mt-0.5">✓</span>
                      <span><strong>No Barriers:</strong> Deploy enterprise infrastructure instantly without licensing budget.</span>
                    </li>
                    <li className="flex items-start gap-2 text-xs text-white/50">
                      <span className="text-emerald-400/70 mt-0.5">✓</span>
                      <span><strong>Rapid Iteration:</strong> Vulnerabilities are patched in hours because the entire community is reviewing the code.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* High-value economic stat card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.04] transition-all">
                  <span className="text-3xl">👥</span>
                  <div>
                    <h4 className="text-sm font-bold text-white">100M+ Developers</h4>
                    <p className="text-xs text-white/40 mt-0.5">Collaborating on platforms like GitHub to shape software daily.</p>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.04] transition-all">
                  <span className="text-3xl">💎</span>
                  <div>
                    <h4 className="text-sm font-bold text-white">$36B+ Economic Value</h4>
                    <p className="text-xs text-white/40 mt-0.5">Created annually through shared, royalty-free open libraries.</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Section 2: Open Source Giants Grid */}
        <section id="open-source-giants" className="space-y-8 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-block text-[10px] uppercase font-mono tracking-widest text-purple-400 border border-purple-500/20 bg-purple-500/5 px-2.5 py-1 rounded">
              The Hall of Legends
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Open Source Giants Powering the World</h2>
            <p className="text-white/40 text-sm">Familiar projects that form the absolute core infrastructure of modern computing.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {giants.map((g) => (
              <div
                key={g.name}
                className={`group rounded-2xl border ${g.accent} bg-gradient-to-br ${g.bg} p-6 flex flex-col justify-between hover:bg-white/[0.025] hover:-translate-y-1 transition-all duration-300 relative overflow-hidden`}
              >
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">{g.icon}</span>
                      <div>
                        <h3 className="font-bold text-white text-base md:text-lg group-hover:text-white transition-colors">{g.name}</h3>
                        <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">{g.category}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded bg-white/5 border border-white/10 ${g.color}`}>
                      {g.impact}
                    </span>
                  </div>
                  <p className="text-white/65 text-xs leading-relaxed mb-4">{g.desc}</p>
                  
                  {/* Fun Fact Section */}
                  <div className="mt-4 p-3 bg-black/35 rounded-xl border border-white/[0.03] text-[11px] leading-relaxed text-white/50">
                    <strong className="text-purple-400">Fun Fact: </strong>{g.funFact}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-white/40 font-mono uppercase tracking-wider">
                  <span>Key Users:</span>
                  <span className="text-white/60 font-semibold lowercase font-sans">{g.keyUsers}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Student Spotlight Advertisements */}
        <section id="student-spotlight" className="space-y-8 scroll-mt-20">
          <div className="relative overflow-hidden rounded-3xl border border-purple-500/15 bg-gradient-to-r from-purple-950/20 to-blue-950/20 p-8">
            <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 blur-3xl rounded-full" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 blur-3xl rounded-full" />
            
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="max-w-md space-y-4 text-left">
                <div className="inline-block text-[10px] uppercase font-mono tracking-widest text-yellow-400 border border-yellow-500/20 bg-yellow-500/5 px-2.5 py-1 rounded">
                  Newton School Spotlight
                </div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
                  You don&apos;t just have to use Open Source.<br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                    You can build it.
                  </span>
                </h2>
                <p className="text-white/55 text-xs md:text-sm leading-relaxed">
                  Newton School of Technology students are building and maintaining actual production-grade utilities with thousands of developers globally. Get inspired by what your peers are coding in the real world.
                </p>
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {/* Termstory Ad Card */}
                <a
                  href="https://github.com/bitflicker64/Termstory"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col justify-between p-5 rounded-2xl bg-black/45 border border-white/[0.08] hover:border-purple-500/35 hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden"
                >
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 font-mono">AD</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">🐧</span>
                      <div>
                        <h3 className="font-bold text-white text-xs group-hover:text-purple-400 transition-colors">Termstory</h3>
                        <span className="text-[9px] text-white/30 font-mono">by @bitflicker64</span>
                      </div>
                    </div>
                    <p className="text-white/50 text-[10px] leading-relaxed mb-3">
                      Turns your terminal history into an AI-narrated timeline. Groups commands into sessions and correlates commits.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-purple-400 font-mono uppercase tracking-wider pt-2 border-t border-white/[0.03]">
                    <span>Memory Engine</span>
                    <span className="group-hover:translate-x-0.5 transition-transform">Star Project →</span>
                  </div>
                </a>

                {/* Filedrop Ad Card */}
                <a
                  href="https://github.com/Dreamstick9/filedrop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col justify-between p-5 rounded-2xl bg-black/45 border border-white/[0.08] hover:border-blue-500/35 hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden"
                >
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-300 font-mono">AD</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">📦</span>
                      <div>
                        <h3 className="font-bold text-white text-xs group-hover:text-blue-400 transition-colors">filedrop</h3>
                        <span className="text-[9px] text-white/30 font-mono">by @Dreamstick9</span>
                      </div>
                    </div>
                    <p className="text-white/50 text-[10px] leading-relaxed mb-3">
                      Instantly share files locally with AES-256-GCM browser encryption. QR code generation for mobile download.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-blue-400 font-mono uppercase tracking-wider pt-2 border-t border-white/[0.03]">
                    <span>File Sharing</span>
                    <span className="group-hover:translate-x-0.5 transition-transform">Star Project →</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Why Contribute */}
        <section id="why-opensource" className="space-y-8 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-block text-[10px] uppercase font-mono tracking-widest text-teal-400 border border-teal-500/20 bg-teal-500/5 px-2.5 py-1 rounded">
              Your growth engine
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Why Do Developers Contribute?</h2>
            <p className="text-white/40 text-sm">How open source contributions supercharge your developer skills and career.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {benefits.map((b, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5 hover:border-purple-500/20 hover:bg-white/[0.03] transition-all group">
                <div className="flex items-start gap-4">
                  <span className="text-3xl flex-shrink-0 mt-0.5 filter group-hover:drop-shadow-[0_0_8px_rgba(168,85,247,0.3)] transition-all duration-300">{b.icon}</span>
                  <div>
                    <h4 className="font-semibold text-white/90 text-sm mb-1 group-hover:text-purple-400 transition-colors">{b.title}</h4>
                    <p className="text-white/45 text-xs leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Steps to get started (Onboarding timeline) */}
        <section id="how-to-start" className="space-y-8 scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-block text-[10px] uppercase font-mono tracking-widest text-blue-400 border border-blue-500/20 bg-blue-500/5 px-2.5 py-1 rounded">
              Road to your first merge
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">The Contribution Roadmap</h2>
            <p className="text-white/40 text-sm">Your gamified roadmap from coding locally to merging your first Pull Request.</p>
          </div>

          <div className="relative border-l border-white/[0.08] ml-4 pl-8 space-y-12 py-2">
            {onboardingSteps.map((step) => (
              <div key={step.n} className="relative group">
                {/* Timeline node */}
                <div className="absolute -left-[42px] top-0 w-6 h-6 rounded-full bg-[#030712] border-2 border-emerald-400 flex items-center justify-center text-[10px] font-bold text-emerald-400 group-hover:bg-emerald-400 group-hover:text-black transition-all duration-300 shadow-[0_0_10px_rgba(52,211,153,0.2)]" />
                
                <div className="space-y-2">
                  <h3 className="font-bold text-white/95 text-base md:text-lg flex items-center gap-2 group-hover:text-emerald-400 transition-colors">
                    <span className="text-emerald-400/80 font-mono text-sm">Step {step.n}:</span> {step.title}
                  </h3>
                  <p className="text-white/50 text-xs md:text-sm leading-relaxed max-w-2xl">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 5: Core Skills Grid */}
        <section className="space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-3xl font-bold text-white tracking-tight">Skills You Will Master</h2>
            <p className="text-white/40 text-sm">Core engineering standards you will learn naturally along your open source journey.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {coreSkills.map((c, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-6 hover:border-purple-500/20 transition-all duration-300">
                <h3 className="font-semibold text-purple-400 text-sm mb-4 border-b border-white/[0.05] pb-2 font-mono uppercase tracking-wider">{c.title}</h3>
                <ul className="space-y-2.5">
                  {c.items.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2.5 text-white/55 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500/60 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Section 6: Guidelines */}
        <section id="guidelines" className="space-y-6 scroll-mt-20">
          <div className="border border-red-500/15 bg-red-500/[0.015] rounded-3xl p-8 relative overflow-hidden space-y-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/[0.02] blur-3xl rounded-full" />
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-red-400">Strict Contributor Guidelines</h2>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 uppercase tracking-wide">Mandatory</span>
            </div>
            <p className="text-white/40 text-xs md:text-sm leading-relaxed max-w-3xl">
              These are strict community standards. Maintainers have long memories, and your GitHub username tracks you throughout your career.
              Violations will lead to being blocked from the repository and programs like GSoC.
            </p>
            
            <div className="space-y-3">
              {guidelines.map((g, i) => (
                <div key={i} className={`rounded-xl border p-5 flex gap-4 ${
                  g.severity === 'critical' ? 'border-red-500/30 bg-red-500/5' :
                  g.severity === 'high'     ? 'border-orange-500/25 bg-orange-500/5' :
                                              'border-emerald-500/25 bg-emerald-500/5'
                }`}>
                  <span className="text-2xl flex-shrink-0">{g.icon}</span>
                  <div>
                    <div className={`font-semibold text-sm ${
                      g.severity === 'critical' ? 'text-red-400' :
                      g.severity === 'high'     ? 'text-orange-400' :
                                                  'text-emerald-400'
                    }`}>{g.title}</div>
                    <div className="text-white/50 text-xs leading-relaxed mt-1">{g.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Call to Action Box */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.02] to-transparent p-8 md:p-10 text-center relative overflow-hidden">
          <div className="absolute bottom-0 right-0 w-40 h-40 bg-purple-500/5 blur-3xl rounded-full" />
          <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3 tracking-tight">Ready to Make Your Mark?</h2>
          <p className="text-white/40 text-sm max-w-md mx-auto mb-8 leading-relaxed">
            Join the leaderboard, track your progress, and climb the ranks on the Hall of Fame.
          </p>
          <div className="flex flex-wrap gap-3.5 justify-center">
            <Link href="/contributors"
              className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold shadow-lg shadow-purple-900/10 transition-all cursor-pointer">
              View Contributors
            </Link>
            <Link href="/achievers"
              className="px-6 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] text-white/80 text-sm font-semibold transition-all cursor-pointer">
              🏆 Hall of Fame
            </Link>
            <Link href="/issues"
              className="px-6 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] text-white/80 text-sm font-semibold transition-all cursor-pointer">
              🔧 Common Issues
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
