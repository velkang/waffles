"use client";

import { useState } from "react";

interface Comment {
  id: string;
  author: string;
  avatarIcon: string;
  timeAgo: string;
  text: string;
  positionUsd?: number;
  spentUsd?: number;
  netPnlUsd?: number;
  netPnlPct?: number;
  avgEntryMc?: string;
  mcAtComment?: string;
  likes: number;
}

export function ThreadComments({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const [activeTab, setActiveTab] = useState<"callouts" | "trades">("callouts");
  const [commentInput, setCommentInput] = useState("");
  const [comments, setComments] = useState<Comment[]>([
    {
      id: "1",
      author: "Stridooor",
      avatarIcon: "🥷",
      timeAgo: "3m ago",
      text: "Good ticker, fair launch bonding curve moving fast on Arc L1.",
      positionUsd: 319.83,
      spentUsd: 2200,
      netPnlUsd: -1307.7,
      netPnlPct: -70.4,
      avgEntryMc: "$76.6k MC",
      mcAtComment: "MC $20.5K",
      likes: 1,
    },
    {
      id: "2",
      author: "HOWDOISELL",
      avatarIcon: "🐸",
      timeAgo: "10m ago",
      text: "This is still early. Bonding curve graduation at $50K USDC incoming.",
      positionUsd: 160.07,
      spentUsd: 211.63,
      netPnlUsd: 65.07,
      netPnlPct: 31.0,
      avgEntryMc: "$21.1k MC",
      mcAtComment: "MC $20.5K",
      likes: 4,
    },
    {
      id: "3",
      author: "xchad",
      avatarIcon: "🚀",
      timeAgo: "17m ago",
      text: "ok if this is real is coded for milss",
      positionUsd: 134.08,
      spentUsd: 479.4,
      netPnlUsd: -187.12,
      netPnlPct: -44.8,
      avgEntryMc: "$54.9k MC",
      mcAtComment: "MC $20.5K",
      likes: 2,
    },
  ]);

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    const newComment: Comment = {
      id: String(Date.now()),
      author: "anonTrader",
      avatarIcon: "⚡",
      timeAgo: "just now",
      text: commentInput.trim(),
      likes: 0,
    };
    setComments([newComment, ...comments]);
    setCommentInput("");
  };

  return (
    <div className="rounded-[10px] bg-[#141519] border border-[#24262e] overflow-hidden flex flex-col">
      {/* Tabs Header */}
      <div className="flex items-center gap-2 p-2.5 border-b border-[#24262e] bg-[#101114] text-xs font-mono">
        <button
          type="button"
          onClick={() => setActiveTab("callouts")}
          className={`rounded-[4px] px-3 py-1 font-bold transition ${
            activeTab === "callouts"
              ? "bg-[#1a1b21] border border-[#24262e] text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Callouts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("trades")}
          className={`rounded-[4px] px-3 py-1 font-bold transition ${
            activeTab === "trades"
              ? "bg-[#1a1b21] border border-[#24262e] text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          Trades
        </button>
      </div>

      {/* Post a Comment Form */}
      <form onSubmit={handlePost} className="p-3 border-b border-[#24262e] bg-[#101114] flex gap-2">
        <input
          type="text"
          placeholder="Post a reply / callout..."
          value={commentInput}
          onChange={(e) => setCommentInput(e.target.value)}
          className="flex-1 rounded-[6px] bg-[#1a1b21] border border-[#24262e] px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-[#db9d6a]"
        />
        <button
          type="submit"
          className="rounded-[6px] bg-[#db9d6a] px-3 py-1.5 text-xs font-bold text-[#0e0f12] hover:bg-[#e5ab7a] transition"
        >
          Post
        </button>
      </form>

      {/* Comments List */}
      <div className="divide-y divide-[#1a1b22] p-2 space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="p-2.5 space-y-2 text-xs">
            {/* Header: User & Timestamp */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-[#1a1b21] border border-[#24262e] flex items-center justify-center text-xs">
                  {c.avatarIcon}
                </div>
                <span className="font-bold text-white font-mono">{c.author}</span>
                <span className="text-[11px] text-zinc-500">{c.timeAgo}</span>
              </div>
            </div>

            {/* Comment Body */}
            <p className="text-zinc-200 leading-relaxed font-sans">{c.text}</p>

            {/* Embedded Position Card (Pump.fun style) */}
            {c.positionUsd !== undefined && (
              <div className="rounded-[6px] bg-[#1a1b21] border border-[#24262e] p-2.5 space-y-1 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <div className="text-zinc-400">
                    Position ⇄ <span className="font-bold text-white">${c.positionUsd.toFixed(2)}</span>
                  </div>
                  <div className="text-zinc-400">
                    Net PNL{" "}
                    <span
                      className={`font-bold ${
                        (c.netPnlUsd ?? 0) >= 0
                          ? "text-[#4ade80]"
                          : "text-[#ef4444]"
                      }`}
                    >
                      {(c.netPnlUsd ?? 0) >= 0 ? "+" : "-"}$
                      {Math.abs(c.netPnlUsd ?? 0).toFixed(2)}{" "}
                      {(c.netPnlPct ?? 0) >= 0 ? "↑" : "↓"}{" "}
                      {Math.abs(c.netPnlPct ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <span>Spent ${c.spentUsd?.toFixed(2)}</span>
                  <span>Avg entry {c.avgEntryMc}</span>
                </div>
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-500 font-mono">
              <div className="flex items-center gap-3">
                <button type="button" className="hover:text-white transition flex items-center gap-1">
                  ⇧ <span>{c.likes}</span>
                </button>
                <button type="button" className="hover:text-white transition">
                  💬 0
                </button>
              </div>
              {c.mcAtComment && <span>{c.mcAtComment}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
