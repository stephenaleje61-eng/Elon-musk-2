import React, { useEffect, useState, useRef } from 'react';
import {
  Rocket,
  CheckCircle2,
  MapPin,
  Clock,
  Send,
  Volume2,
  VolumeX,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import {
  VisitorRecord,
  MessageRecord,
  OwnerPresenceRecord,
  subscribeToVisitors,
  subscribeToVisitorMessages,
  subscribeToOwnerPresence,
  sendChatMessage,
  clearVisitorUnread,
  saveOwnerPresence,
} from '../lib/firebase';
import { FounderAvatar } from './FounderAvatar';
import { soundEngine } from '../lib/sound';

interface OwnerConsoleProps {
  onNavigateSpace: () => void;
}

export const OwnerConsole: React.FC<OwnerConsoleProps> = ({ onNavigateSpace }) => {
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [loadingVisitors, setLoadingVisitors] = useState(true);
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [intentFilter, setIntentFilter] = useState<string>('ALL');

  // Owner Profile & Starbase Presence state
  const [presence, setPresence] = useState<OwnerPresenceRecord>({
    ownerName: 'Elon Musk',
    ownerTitle: 'Owner · Verified',
    statusText: 'Online in Starbase',
    isOnline: true,
    updatedAt: null,
  });
  const [profileSelectorValue, setProfileSelectorValue] = useState('Elon Musk (Owner)');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubVisitors = subscribeToVisitors((liveList) => {
      setVisitors(liveList);
      setLoadingVisitors(false);
      setSelectedVisitorId((prev) => {
        if (prev && liveList.some((v) => v.visitorId === prev)) {
          return prev;
        }
        return liveList.length > 0 ? liveList[0].visitorId : null;
      });
    });

    const unsubPresence = subscribeToOwnerPresence((livePresence) => {
      setPresence(livePresence);
    });

    return () => {
      unsubVisitors();
      unsubPresence();
    };
  }, []);

  useEffect(() => {
    if (!selectedVisitorId) {
      setMessages([]);
      return;
    }
    // Clear unread count for owner when opening thread
    clearVisitorUnread(selectedVisitorId).catch(() => {});

    const unsubMsgs = subscribeToVisitorMessages(selectedVisitorId, (liveMsgs) => {
      setMessages(liveMsgs);
    });

    return () => {
      unsubMsgs();
    };
  }, [selectedVisitorId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedVisitor = visitors.find((v) => v.visitorId === selectedVisitorId) || null;

  const filteredVisitors = visitors.filter((v) => {
    if (intentFilter === 'ALL') return true;
    return v.intentCategory === intentFilter;
  });

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const ownerName =
        profileSelectorValue === 'Elon Musk (Owner)'
          ? 'Elon Musk'
          : 'Elon Musk · Starbase Direct';
      await saveOwnerPresence({
        ownerName,
        ownerTitle: 'Owner · Verified',
        statusText: 'Online in Starbase',
        isOnline: true,
      });
      setProfileSavedToast(true);
      setTimeout(() => setProfileSavedToast(false), 2500);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisitor || !replyText.trim() || sending) return;

    const textToSend = replyText.trim();
    setSending(true);
    setReplyText('');

    try {
      await sendChatMessage({
        visitorId: selectedVisitor.visitorId,
        senderRole: 'owner',
        senderName: presence.ownerName || 'Elon Musk',
        text: textToSend,
        intentCategory: selectedVisitor.intentCategory,
        currentUnreadForOwner: 0,
      });
      soundEngine.playRocketSend();
    } catch (err) {
      setReplyText(textToSend);
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const formatTimestamp = (ts: { toMillis?: () => number } | null) => {
    if (!ts || typeof ts.toMillis !== 'function') return 'Just now';
    const date = new Date(ts.toMillis());
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEngine.enabled = next;
  };

  return (
    <div className="relative z-10 flex flex-col flex-1 w-full max-w-[1440px] mx-auto px-2 sm:px-6 py-3 sm:py-5">
      {/* Owner Console Control Bar */}
      <div className="bg-[#0B1426]/90 backdrop-blur-md border border-[#A1A1A6]/25 rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FounderAvatar size="md" showVerified={true} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-sm sm:text-lg tracking-wider uppercase text-white">
                OWNER LIVE CONSOLE
              </h1>
              <span className="text-xs text-[#A1A1A6] font-mono tabular-nums">
                · ACTIVE VISITORS ({visitors.length})
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#D4D4D8] mt-0.5">
              <span>Presence: {presence.statusText || 'Online in Starbase'}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#A1A1A6]">Direct 1-on-1 Live Dispatch</span>
            </div>
          </div>
        </div>

        {/* Current Profile Selector with Verified badge & Save button */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 bg-[#0A0A0A] border border-[#A1A1A6]/30 rounded-lg px-2.5 py-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#E31937] shrink-0" />
            <label htmlFor="owner-profile-select" className="sr-only">
              Current Profile
            </label>
            <select
              id="owner-profile-select"
              value={profileSelectorValue}
              onChange={(e) => setProfileSelectorValue(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-medium text-white focus:outline-none pr-2"
            >
              <option value="Elon Musk (Owner)" className="bg-[#0A0A0A] text-white">
                Elon Musk (Owner) ✓ Verified
              </option>
              <option value="Elon Musk · Starbase Direct" className="bg-[#0A0A0A] text-white">
                Elon Musk · Starbase Direct ✓
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="px-3.5 py-1.5 rounded-lg bg-[#E31937] hover:bg-[#c81430] text-white text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {savingProfile ? 'SAVING...' : profileSavedToast ? 'SAVED ✓' : 'SAVE'}
          </button>

          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? 'Mute Rocket Audio' : 'Enable Rocket Audio'}
            className="p-2 rounded-lg bg-[#0A0A0A] border border-[#A1A1A6]/25 text-[#D4D4D8] hover:text-white transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Split Console: 30% Left Inbox / 70% Right Chat even on mobile */}
      <div className="flex flex-row w-full flex-1 min-h-[640px] h-[calc(100vh-210px)] bg-[#0A0A0A]/90 backdrop-blur-md border border-[#A1A1A6]/25 rounded-xl overflow-hidden">
        {/* LEFT INBOX (30% on mobile, 340px on large desktop) */}
        <aside className="w-[30%] sm:w-[32%] lg:w-[360px] shrink-0 border-r border-[#A1A1A6]/20 flex flex-col bg-[#0B1426]/40">
          {/* Inbox Header & Filter Bar */}
          <div className="p-2.5 sm:p-4 border-b border-[#A1A1A6]/20">
            <div className="flex items-center justify-between gap-1 mb-2.5">
              <span className="font-display font-bold text-[11px] sm:text-xs tracking-wider uppercase text-white truncate">
                ACTIVE VISITORS ({visitors.length})
              </span>
            </div>

            {/* Interactive Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {(['ALL', 'ORDER', 'INVESTMENT', 'CHAT', 'COLLABORATION'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setIntentFilter(tab)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    intentFilter === tab
                      ? 'bg-[#E31937] text-white'
                      : 'bg-[#0A0A0A]/80 text-[#A1A1A6] hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Real Live Visitor List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#A1A1A6]/15">
            {loadingVisitors ? (
              <div className="p-4 space-y-3">
                <div className="h-1.5 w-full bg-[#0B1426] overflow-hidden rounded-full">
                  <div className="h-full w-1/2 bg-[#E31937] tesla-charge-bar" />
                </div>
                <p className="text-xs text-[#A1A1A6] text-center">
                  Syncing live Starbase telemetry...
                </p>
              </div>
            ) : filteredVisitors.length === 0 ? (
              <div className="p-4 sm:p-6 text-center space-y-3">
                <MessageSquare className="w-6 h-6 text-[#A1A1A6] mx-auto opacity-60" />
                <p className="text-xs text-[#D4D4D8] leading-relaxed">
                  No active visitors yet. When a visitor enters ELON MUSK SPACE from any country, their live session appears here immediately.
                </p>
                <button
                  type="button"
                  onClick={onNavigateSpace}
                  className="px-3 py-1.5 rounded-lg bg-[#0B1426] border border-[#A1A1A6]/30 text-[11px] font-semibold text-white hover:border-white transition-colors cursor-pointer"
                >
                  Open Visitor Entry
                </button>
              </div>
            ) : (
              filteredVisitors.map((visitor) => {
                const isSelected = visitor.visitorId === selectedVisitorId;
                return (
                  <button
                    key={visitor.visitorId}
                    type="button"
                    onClick={() => setSelectedVisitorId(visitor.visitorId)}
                    className={`w-full text-left p-2.5 sm:p-3.5 transition-colors cursor-pointer block ${
                      isSelected
                        ? 'bg-[#0B1426] border-l-2 border-l-[#E31937]'
                        : 'hover:bg-[#0B1426]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-semibold text-xs sm:text-sm text-white truncate">
                        {visitor.name || 'Anonymous'}
                      </span>
                      <span className="text-[10px] sm:text-xs font-mono tabular-nums text-[#A1A1A6] shrink-0">
                        {formatTimestamp(visitor.updatedAt || visitor.createdAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] sm:text-xs text-[#A1A1A6] mb-1.5">
                      <span className="inline-flex items-center gap-0.5 truncate max-w-full">
                        <MapPin className="w-3 h-3 text-[#E31937] shrink-0" />
                        <span className="truncate">{visitor.location}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono font-semibold text-white uppercase">
                        {visitor.intentCategory}
                      </span>
                      {visitor.unreadForOwner > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#E31937] font-mono font-bold tabular-nums">
                            {visitor.unreadForOwner} NEW
                          </span>
                        </>
                      )}
                    </div>

                    <p className="text-[11px] sm:text-xs text-[#D4D4D8] line-clamp-2 break-words">
                      {visitor.lastMessagePreview || visitor.intentSummary}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* RIGHT 1-ON-1 CHAT PANEL (70% on mobile, flex-1 on desktop) */}
        <section className="w-[70%] sm:w-[68%] flex-1 flex flex-col bg-[#0A0A0A] h-full">
          {selectedVisitor ? (
            <>
              {/* Active Visitor Thread Header */}
              <div className="px-3 sm:px-5 py-3 border-b border-[#A1A1A6]/20 bg-[#0B1426]/60 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display font-bold text-sm sm:text-base text-white uppercase tracking-wide truncate">
                      {selectedVisitor.name || 'Anonymous'}
                    </h2>
                    <span className="text-xs text-[#A1A1A6] font-mono">
                      · {selectedVisitor.intentCategory}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#D4D4D8] mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#E31937]" />
                      {selectedVisitor.location}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-[#A1A1A6] truncate max-w-[260px] sm:max-w-[420px]">
                      Intent: {selectedVisitor.intentSummary}
                    </span>
                  </div>
                </div>

                <div className="text-right hidden sm:block">
                  <span className="text-xs font-mono text-[#A1A1A6] inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Direct Line Active
                  </span>
                </div>
              </div>

              {/* Real-time Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3.5">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <p className="text-xs sm:text-sm text-[#A1A1A6]">
                      No messages in this thread yet. Send a direct response below.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwner = msg.senderRole === 'owner';
                    return (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-2.5 ${
                          isOwner ? 'justify-start' : 'justify-end'
                        }`}
                      >
                        {isOwner && <FounderAvatar size="sm" showVerified={true} />}
                        <div
                          className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-3.5 py-2.5 ${
                            isOwner
                              ? 'bg-[#0B1426] border border-[#A1A1A6]/35 text-white rounded-bl-sm'
                              : 'bg-[#1D4ED8] text-white rounded-br-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-1 text-[11px] text-[#D4D4D8]/90">
                            <span className="font-semibold">
                              {isOwner ? `${msg.senderName} ✓` : msg.senderName}
                            </span>
                            <span className="font-mono tabular-nums text-[10px] opacity-80">
                              {formatTimestamp(msg.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words text-white">
                            {msg.text}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Sticky Big Reply Box at Bottom (min-h-[140px], white text, Rocket Send button) */}
              <form
                onSubmit={handleSendReply}
                className="sticky bottom-0 z-20 p-2.5 sm:p-4 bg-[#0B1426]/95 border-t border-[#A1A1A6]/25 backdrop-blur-md"
              >
                <div className="relative flex flex-col gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleSendReply(e);
                      }
                    }}
                    placeholder={`Reply directly as ${presence.ownerName} to ${selectedVisitor.name}... (Type your message here)`}
                    className="w-full min-h-[140px] p-3.5 rounded-xl bg-[#0A0A0A] border border-[#A1A1A6]/35 focus:border-[#E31937] focus:outline-none text-white placeholder-[#A1A1A6]/70 text-sm sm:text-base leading-relaxed resize-y"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#A1A1A6] hidden sm:inline">
                      Replying as <strong className="text-white">{presence.ownerName}</strong> · Presence: Online in Starbase
                    </span>
                    <button
                      type="submit"
                      disabled={sending || !replyText.trim()}
                      className="ml-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#E31937] hover:bg-[#c81430] disabled:opacity-45 text-white font-display font-bold text-xs sm:text-sm tracking-wider uppercase transition-all cursor-pointer shadow-[0_0_20px_rgba(227,25,55,0.45)] whitespace-nowrap shrink-0"
                    >
                      <Rocket className="w-4 h-4" />
                      <span>{sending ? 'DISPATCHING...' : 'SEND REPLY'}</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <FounderAvatar size="lg" showVerified={true} />
              <h2 className="font-display font-bold text-base sm:text-lg text-white uppercase tracking-wider mt-4">
                STARBASE OWNER DISPATCH
              </h2>
              <p className="text-xs sm:text-sm text-[#D4D4D8] max-w-md mt-2 leading-relaxed">
                Select any live visitor card on the left inbox to open a 1-on-1 real-time channel.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
