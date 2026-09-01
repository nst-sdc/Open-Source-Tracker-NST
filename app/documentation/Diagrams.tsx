// Hand-built inline SVG diagrams for /documentation. Matches the app's
// existing chart style (see ContributionChart in app/contributors/[username]/page.tsx) —
// light theme, --color-* tokens via inline hex (SVG can't read CSS vars
// reliably across all renderers, so values are the token's literal hex).

const INK = '#0b0c0e';
const INK_MID = '#30363d';
const INK_SOFT = '#5b6271';
const LINE = '#e1e5ea';
const PANEL = '#f6f7f9';
const BRAND = '#0673f9';
const BRAND_0 = '#e5f1ff';
const GOLD = '#d17300';
const GOLD_0 = '#fff3d6';
const VIOLET = '#6138d3';
const VIOLET_0 = '#f5e5ff';
const SUCCESS = '#007a51';
const SUCCESS_0 = '#d9fced';

function Box({
  x, y, w, h, fill, stroke, label, sublabel, labelColor = INK,
}: { x: number; y: number; w: number; h: number; fill: string; stroke: string; label: string; sublabel?: string; labelColor?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2 + (sublabel ? -4 : 5)} textAnchor="middle" fontSize={12.5} fontWeight={650} fill={labelColor}>
        {label}
      </text>
      {sublabel && (
        <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fontSize={10} fill={INK_SOFT}>
          {sublabel}
        </text>
      )}
    </g>
  );
}

function Arrow({ d, color = INK_SOFT, dashed = false }: { d: string; color?: string; dashed?: boolean }) {
  return <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={dashed ? '4 3' : undefined} markerEnd="url(#arrowhead)" />;
}

function ArrowDefs() {
  return (
    <defs>
      <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6.5" refY="3" orient="auto">
        <path d="M0,0 L7,3 L0,6 Z" fill={INK_SOFT} />
      </marker>
    </defs>
  );
}

export function ArchitectureDiagram() {
  return (
    <div className="bg-ground border border-line rounded-2xl shadow-card p-5 overflow-x-auto">
      <svg viewBox="0 0 900 460" className="w-full h-auto min-w-[640px]">
        <ArrowDefs />

        <Box x={370} y={20} w={160} h={54} fill={PANEL} stroke={LINE} label="Browser" sublabel="any visitor" />

        <rect x={40} y={110} width={820} height={330} rx={16} fill="#faf7ff" stroke={VIOLET_0} strokeWidth={1.5} />
        <text x={60} y={135} fontSize={11} fontWeight={650} fill={VIOLET}>CLOUDFLARE TUNNEL — the only way in, no open ports on the node</text>

        <Box x={370} y={160} w={160} h={54} fill={VIOLET_0} stroke={VIOLET} labelColor={VIOLET} label="cloudflared" sublabel="outbound-only daemon" />

        <rect x={70} y={250} width={760} height={165} rx={14} fill="#fff" stroke={LINE} strokeWidth={1.5} />
        <text x={90} y={272} fontSize={11} fontWeight={650} fill={INK_SOFT}>PHYSICAL NODE — nst-n1 (single k3s cluster)</text>

        <Box x={340} y={295} w={220} h={60} fill={BRAND_0} stroke={BRAND} labelColor={BRAND} label="Next.js app pod" sublabel="opensource-tracker deployment" />

        <Box x={90} y={295} w={190} h={60} fill={GOLD_0} stroke={GOLD} labelColor={GOLD} label="k8s CronJob" sublabel="every 15 min" />

        <Box x={620} y={295} w={190} h={60} fill={SUCCESS_0} stroke={SUCCESS} labelColor={SUCCESS} label="kubectl (you)" sublabel="via SSH or Rancher shell" />

        <Box x={90} y={375} w={340} h={44} fill={PANEL} stroke={LINE} label="Upstash Redis (KV)" sublabel="profile / summary / repo caches" />
        <Box x={470} y={375} w={340} h={44} fill={PANEL} stroke={LINE} label="GitHub REST + Search API" sublabel="5,000 req/hr · 30 search/min" />

        <Arrow d="M450 74 L450 156" />
        <Arrow d="M450 214 L450 291" />
        <Arrow d="M280 318 L336 318" />
        <text x={308} y={310} textAnchor="middle" fontSize={8.5} fill={INK_SOFT}>POST /refresh</text>
        <Arrow d="M616 318 L564 318" />
        <text x={590} y={310} textAnchor="middle" fontSize={8.5} fill={INK_SOFT}>deploys</text>
        <Arrow d="M340 355 Q300 365 280 375" />
        <Arrow d="M560 355 Q600 365 620 375" />
      </svg>
      <p className="text-ink-soft text-xs mt-3 leading-relaxed">
        The tunnel is a deliberate tradeoff: it means no port ever needs to be open on the node (nothing for bots to
        scan or brute-force), at the cost of being a single point of failure — if <code className="text-[11px] bg-panel px-1 py-0.5 rounded">cloudflared</code> itself
        goes down, both the public site and SSH access disappear at the same time, with no independent fallback path.
      </p>
    </div>
  );
}

export function CachingFlowDiagram() {
  return (
    <div className="bg-ground border border-line rounded-2xl shadow-card p-5 overflow-x-auto">
      <svg viewBox="0 0 900 400" className="w-full h-auto min-w-[640px]">
        <ArrowDefs />

        <Box x={30} y={30} w={190} h={54} fill={PANEL} stroke={LINE} label="Visit /contributors" />

        <Box x={330} y={30} w={240} h={54} fill={GOLD_0} stroke={GOLD} labelColor={GOLD} label="summary_cache:{period}" sublabel="one KV read" />

        <Box x={670} y={30} w={200} h={54} fill={SUCCESS_0} stroke={SUCCESS} labelColor={SUCCESS} label="Serve instantly" sublabel="cache fresh" />

        <Box x={330} y={160} w={240} h={60} fill={BRAND_0} stroke={BRAND} labelColor={BRAND} label="getAllStudentSummaries()" sublabel="cache missing / stale" />

        <Box x={40} y={280} w={230} h={60} fill={PANEL} stroke={LINE} label="profile_cache:{student}" sublabel="× ~1,800, per-student" />
        <Box x={340} y={280} w={220} h={60} fill={PANEL} stroke={LINE} label="repo_cache_map" sublabel="~16 quality signals per repo" />
        <Box x={630} y={280} w={230} h={60} fill={GOLD_0} stroke={GOLD} labelColor={GOLD} label="repoMultiplier()" sublabel="10·M^0.75, M = 0.15 + 2.85·C·G" />

        <Arrow d="M220 57 L326 57" />
        <Arrow d="M570 57 L666 57" />
        <text x={598} y={48} fontSize={9} fill={SUCCESS}>fresh</text>
        <Arrow d="M450 84 L450 156" />
        <text x={462} y={125} fontSize={9} fill={INK_SOFT}>stale</text>
        <Arrow d="M400 220 Q280 245 155 276" />
        <Arrow d="M450 220 L450 276" />
        <Arrow d="M500 220 Q620 245 745 276" />
        <Arrow d="M270 310 L336 310" dashed />
        <Arrow d="M560 310 L626 310" dashed />

        <path d="M745 340 Q745 380 450 380 Q160 380 160 344" fill="none" stroke={GOLD} strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#arrowhead)" />
        <text x={450} y={396} textAnchor="middle" fontSize={9.5} fill={GOLD}>writes fresh result back to summary_cache before responding</text>
      </svg>
      <p className="text-ink-soft text-xs mt-3 leading-relaxed">
        No page load ever live-fetches all ~1,800 students from GitHub — that would blow past the Search API&apos;s
        30-requests-per-minute limit almost instantly. Individual <code className="text-[11px] bg-panel px-1 py-0.5 rounded">profile_cache</code> entries
        are what actually hold GitHub data, refreshed in small batches by the CronJob; the summary read path only ever
        recombines what&apos;s already cached.
      </p>
    </div>
  );
}
