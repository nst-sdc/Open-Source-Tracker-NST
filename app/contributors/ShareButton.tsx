'use client';

import { useState, useEffect } from 'react';

interface Badge {
  id: string;
  name: string;
}

interface Props {
  username: string;
  displayName: string;
  avatarUrl: string;
  mergedCount: number;
  totalCount: number;
  badges: Badge[];
}

export function ShareButton({
  username,
  displayName,
  avatarUrl,
  mergedCount,
  totalCount,
  badges,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const profileUrl = `${origin}/contributors/${username}`;

  // Close modal on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  function copyLink() {
    navigator.clipboard.writeText(profileUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function downloadCard() {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 450;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Violet contest gradient — the leaderboard hero, as a card
      const bgGrad = ctx.createLinearGradient(0, 0, 800, 450);
      bgGrad.addColorStop(0, '#46279b');
      bgGrad.addColorStop(0.55, '#331d72');
      bgGrad.addColorStop(1, '#221056');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 800, 450);

      // 2. Faint engineering grid, like the live hero
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= 800; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 450); ctx.stroke();
      }
      for (let y = 0; y <= 450; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
      }

      // 3. Header branding
      ctx.fillStyle = '#cebcfe';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('OPENSOURCE TRACKER · NST', 45, 51);

      // 4. Avatar (async load with CORS)
      let avatarLoaded = false;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = avatarUrl;
      await new Promise((resolve) => {
        img.onload = () => {
          avatarLoaded = true;
          resolve(null);
        };
        img.onerror = () => {
          avatarLoaded = false;
          resolve(null);
        };
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(105, 160, 52, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (avatarLoaded) {
        try {
          ctx.drawImage(img, 53, 108, 104, 104);
        } catch {
          avatarLoaded = false;
        }
      }

      if (!avatarLoaded) {
        // Fallback placeholder if image fetch fails due to CORS or network
        ctx.fillStyle = '#002452';
        ctx.fillRect(53, 108, 104, 104);
        ctx.fillStyle = '#61a8ff';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(displayName[0]?.toUpperCase() ?? '?', 105, 175);
      }
      ctx.restore();

      // White avatar ring, like the podium
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(105, 160, 52, 0, Math.PI * 2);
      ctx.stroke();

      // Reset text alignment
      ctx.textAlign = 'left';

      // 5. User profile details
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText(displayName, 180, 150);

      ctx.fillStyle = '#cebcfe';
      ctx.font = '15px sans-serif';
      ctx.fillText(`@${username}`, 180, 180);

      // 6. Stats
      ctx.fillStyle = '#cebcfe';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('CONTRIBUTIONS', 45, 290);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(String(totalCount), 45, 340);

      ctx.fillStyle = '#cebcfe';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('MERGED PRs', 245, 290);
      ctx.fillStyle = '#7ee7b8';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(String(mergedCount), 245, 340);

      // 7. Badges showcase
      if (badges.length > 0) {
        ctx.fillStyle = '#cebcfe';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('HIGHLIGHTS', 500, 115);

        badges.slice(0, 3).forEach((badge, idx) => {
          const bx = 500;
          const by = 135 + idx * 45;

          // Capsule box
          ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(bx, by, 250, 36, 18);
          } else {
            ctx.rect(bx, by, 250, 36);
          }
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = '13px sans-serif';
          ctx.fillText(badge.name, bx + 15, by + 23);
        });
      }

      // 8. Footer watermark
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '11px sans-serif';
      ctx.fillText('oss-tracker.nstsdc.org', 45, 410);

      // 9. Generate and download image
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `nst-opensource-card-${username}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate PNG card:', err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex items-center">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 text-xs font-[550] h-9 px-3.5 rounded-[10px] bg-violet-0 text-violet-600 hover:bg-violet-100 transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share card
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-ground border border-line rounded-2xl p-6 shadow-pop flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-ink font-[650] text-base">Your contributor card</h3>
                <p className="text-ink-soft text-xs mt-0.5">Download it, or share your profile link.</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="text-ink-soft hover:text-ink p-1 hover:bg-panel rounded-lg transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Card preview — mirrors the downloaded PNG */}
            <div className="w-full aspect-[16/9] rounded-xl bg-gradient-to-br from-violet-700 via-violet-800 to-violet-900 contest-grid relative overflow-hidden p-5 flex flex-col justify-between shadow-card">
              <div className="relative flex items-center gap-2 text-[10px] font-[650] tracking-[0.12em] text-violet-200">
                <svg className="w-3.5 h-3.5 text-gold-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.5 7.5 6 10.5 12 4l6 6.5 3.5-3v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9Z" />
                </svg>
                <span>OPENSOURCE TRACKER · NST</span>
              </div>

              <div className="relative flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-16 h-16 rounded-full border-[3px] border-white object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <h4 className="font-[650] text-white text-lg truncate leading-snug">{displayName}</h4>
                  <p className="text-violet-200 text-xs truncate">@{username}</p>
                </div>
              </div>

              <div className="relative flex justify-between items-end">
                <div className="flex gap-8">
                  <span>
                    <span className="block text-[8.5px] font-[650] text-violet-200 tracking-[0.1em]">CONTRIBUTIONS</span>
                    <span className="block text-2xl font-[650] text-white tabular-nums mt-0.5">{totalCount}</span>
                  </span>
                  <span>
                    <span className="block text-[8.5px] font-[650] text-violet-200 tracking-[0.1em]">MERGED PRS</span>
                    <span className="block text-2xl font-[650] text-success-200 tabular-nums mt-0.5">{mergedCount}</span>
                  </span>
                </div>
                {badges.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1 max-w-[160px]">
                    {badges.slice(0, 3).map((b) => (
                      <span
                        key={b.id}
                        className="px-2 py-0.5 rounded-full bg-white/12 text-[8.5px] font-[550] text-white whitespace-nowrap"
                      >
                        {b.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                onClick={downloadCard}
                disabled={downloading}
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[11px] bg-brand-solid hover:bg-brand-solid-hover disabled:opacity-50 text-white text-sm font-[550] shadow-brand-btn transition-colors cursor-pointer"
              >
                <svg className={`w-4 h-4 ${downloading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {downloading ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  )}
                </svg>
                {downloading ? 'Preparing…' : 'Download PNG'}
              </button>
              <button
                onClick={copyLink}
                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[11px] bg-ground border border-line-strong hover:bg-panel text-ink text-sm font-[550] transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-success-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy profile link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
