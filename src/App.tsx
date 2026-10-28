import React, { useState, useEffect, useRef } from 'react';
import {
  Rocket,
  DollarSign,
  Brain,
  Satellite,
  MapPin,
  Send,
  X,
  Volume2,
  VolumeX,
  PlusCircle,
  ShieldCheck,
} from 'lucide-react';
import { StarfieldBackground } from './components/StarfieldBackground';
import { FounderAvatar } from './components/FounderAvatar';
import { OwnerConsole } from './components/OwnerConsole';
import {
  IntentCategory,
  MessageRecord,
  OwnerPresenceRecord,
  VisitorRecord,
  createOrUpdateVisitorSession,
  generateSafeId,
  sendChatMessage,
  subscribeToOwnerPresence,
  subscribeToVisitorDoc,
  subscribeToVisitorMessages,
} from './lib/firebase';
import {
  detectVisitorLocation,
  GLOBAL_INNOVATION_HUBS,
  normalizeLocationHub,
} from './lib/location';
import { soundEngine } from './lib/sound';

type AppRoute = 'landing' | 'space' | 'owner';

const VISITOR_STORAGE_KEY = 'elon_musk_space_visitor_id_v1';
const VISITOR_NAME_KEY = 'elon_musk_space_visitor_name_v1';

interface IntentOption {
  id: IntentCategory;
  title: string;
  tagLabel: string;
  subtitle: string;
  icon: React.ReactNode;
}

const INTENT_OPTIONS: IntentOption[] = [
  {
    id: 'ORDER',
    title: 'Order Tesla / SpaceX Product (ORDER)',
    tagLabel: 'ORDER',
    subtitle: 'Starlink Enterprise, Cybertruck Fleet, Model S Plaid, or Starship Payload',
    icon: <Rocket className="w-6 h-6 text-[#E31937]" />,
  },
  {
    id: 'INVESTMENT',
    title: 'Investment & Business ($500 - $100k+) (INVESTMENT)',
    tagLabel: 'INVESTMENT',
    subtitle: 'Direct capital allocation, strategic venture partnerships & institutional tiers',
    icon: <DollarSign className="w-6 h-6 text-[#E31937]" />,
  },
  {
    id: 'CHAT',
    title: 'Ask Elon AI (CHAT)',
    tagLabel: 'CHAT',
    subtitle: 'Direct line for first-principles engineering, physics & innovation discussion',
    icon: <Brain className="w-6 h-6 text-[#E31937]" />,
  },
  {
    id: 'COLLABORATION',
    title: 'SpaceX Collaboration',
    tagLabel: 'COLLABORATION',
    subtitle: 'Aerospace engineering, orbital logistics, Starbase research & supplier proposals',
    icon: <Satellite className="w-6 h-6 text-[#E31937]" />,
  },
];

function resolveInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return 'landing';
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  if (path.startsWith('/owner') || hash.includes('/owner') || hash === '#owner') {
    return 'owner';
  }
  if (path.startsWith('/space') || hash.includes('/space')) {
    return 'space';
  }
  const savedVisitorId = localStorage.getItem(VISITOR_STORAGE_KEY);
  if (savedVisitorId) {
    return 'space';
  }
  return 'landing';
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(resolveInitialRoute);
  const [isIntentModalOpen, setIsIntentModalOpen] = useState(false);

  // Visitor identity & automatic IP location state
  const [visitorId, setVisitorId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(VISITOR_STORAGE_KEY) || '';
  });
  const [visitorName, setVisitorName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(VISITOR_NAME_KEY) || '';
  });
  const [detectedLocation, setDetectedLocation] = useState<string>('Austin, TX, USA');

  // Modal form state
  const [selectedIntent, setSelectedIntent] = useState<IntentCategory>('ORDER');
  const [intentInput, setIntentInput] = useState<string>('');
  const [enteringSpace, setEnteringSpace] = useState(false);

  // Live Chat Space state
  const [visitorRecord, setVisitorRecord] = useState<VisitorRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [ownerPresence, setOwnerPresence] = useState<OwnerPresenceRecord>({
    ownerName: 'Elon Musk',
    ownerTitle: 'Owner · Starbase Command',
    statusText: 'Online in Starbase',
    isOnline: true,
    updatedAt: null,
  });
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Detect visitor city/country from IP automatically on mount (filtered to US/Australia/Global hubs)
  useEffect(() => {
    let mounted = true;
    detectVisitorLocation().then((loc) => {
      if (mounted) {
        setDetectedLocation(normalizeLocationHub(loc, visitorId));
      }
    });
    return () => {
      mounted = false;
    };
  }, [visitorId]);

  // Listen to browser popstate so /owner and / links work seamlessly
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path.startsWith('/owner')) {
        setRoute('owner');
      } else if (path.startsWith('/space')) {
        setRoute('space');
      } else {
        setRoute('landing');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Subscribe to Owner Presence in Starbase
  useEffect(() => {
    const unsub = subscribeToOwnerPresence((livePresence) => {
      setOwnerPresence(livePresence);
    });
    return () => unsub();
  }, []);

  // Subscribe to current visitor's document and messages when in ELON MUSK SPACE
  useEffect(() => {
    if (!visitorId) return;

    const unsubVisitor = subscribeToVisitorDoc(visitorId, (docData) => {
      setVisitorRecord(docData);
    });

    const unsubMsgs = subscribeToVisitorMessages(visitorId, (liveMsgs) => {
      setMessages(liveMsgs);
    });

    return () => {
      unsubVisitor();
      unsubMsgs();
    };
  }, [visitorId]);

  useEffect(() => {
    if (route === 'space') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, route]);

  const navigateTo = (target: AppRoute) => {
    setRoute(target);
    try {
      const nextUrl =
        target === 'owner' ? '/owner' : target === 'space' ? '/space' : '/';
      window.history.pushState({}, '', nextUrl);
    } catch {
      // Ignore history pushState restrictions in sandboxed environments
    }
  };

  const handleContinueToSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enteringSpace) return;

    setEnteringSpace(true);
    try {
      const activeId = visitorId || generateSafeId('visitor');
      const cleanName = visitorName.trim() || 'Anonymous';
      const cleanLocation = normalizeLocationHub(detectedLocation, activeId);
      const optionMeta = INTENT_OPTIONS.find((o) => o.id === selectedIntent);
      const summaryText =
        intentInput.trim() ||
        `${optionMeta?.title || selectedIntent} — Direct Line Inquiry`;

      const savedId = await createOrUpdateVisitorSession({
        visitorId: activeId,
        name: cleanName,
        location: cleanLocation,
        intentCategory: selectedIntent,
        intentSummary: summaryText,
      });

      localStorage.setItem(VISITOR_STORAGE_KEY, savedId);
      localStorage.setItem(VISITOR_NAME_KEY, cleanName);
      setVisitorId(savedId);
      setDetectedLocation(cleanLocation);
      setIsIntentModalOpen(false);
      setIntentInput('');
      soundEngine.playRocketSend();
      navigateTo('space');
    } finally {
      setEnteringSpace(false);
    }
  };

  const handleVisitorSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || sendingMessage) return;

    const textToSend = messageInput.trim();
    setSendingMessage(true);
    setMessageInput('');

    try {
      let currentId = visitorId;
      if (!currentId || !visitorRecord) {
        currentId = generateSafeId('visitor');
        const cleanName = visitorName.trim() || 'Anonymous';
        const cleanLocation = normalizeLocationHub(detectedLocation, currentId);
        await createOrUpdateVisitorSession({
          visitorId: currentId,
          name: cleanName,
          location: cleanLocation,
          intentCategory: selectedIntent,
          intentSummary: textToSend,
        });
        localStorage.setItem(VISITOR_STORAGE_KEY, currentId);
        setVisitorId(currentId);
      } else {
        await sendChatMessage({
          visitorId: currentId,
          senderRole: 'visitor',
          senderName: visitorRecord.name || visitorName.trim() || 'Anonymous',
          text: textToSend,
          intentCategory: visitorRecord.intentCategory || selectedIntent,
          currentUnreadForOwner: visitorRecord.unreadForOwner ?? 0,
        });
      }
      soundEngine.playRocketSend();
    } catch (err) {
      setMessageInput(textToSend);
      console.error(err);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleStartNewIntent = () => {
    setIsIntentModalOpen(true);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEngine.enabled = next;
  };

  const formatMessageTime = (ts: { toMillis?: () => number } | null) => {
    if (!ts || typeof ts.toMillis !== 'function') return 'Just now';
    return new Date(ts.toMillis()).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeDisplayLocation = normalizeLocationHub(
    visitorRecord?.location || detectedLocation,
    visitorId
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0A] text-white relative selection:bg-[#E31937] selection:text-white">
      <StarfieldBackground />

      {/* Top Navigation Bar — Strict 3-Zone Contract */}
      <header className="relative z-20 flex items-center justify-between gap-8 px-4 sm:px-8 py-3.5 border-b border-[#A1A1A6]/20 bg-[#0A0A0A]/85 backdrop-blur-md">
        {/* Zone 1: Brand Title */}
        <button
          type="button"
          onClick={() => navigateTo('landing')}
          className="font-display font-bold text-base sm:text-lg tracking-widest uppercase text-white whitespace-nowrap shrink-0 cursor-pointer text-left"
        >
          ELON MUSK SPACE
        </button>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav className="flex items-center gap-4 sm:gap-7 text-xs sm:text-sm font-medium text-[#D4D4D8]">
          <button
            type="button"
            onClick={() => navigateTo('landing')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              route === 'landing' ? 'text-white underline underline-offset-8 decoration-[#E31937]' : ''
            }`}
          >
            Portal
          </button>
          <button
            type="button"
            onClick={() => {
              if (visitorId) {
                navigateTo('space');
              } else {
                setIsIntentModalOpen(true);
              }
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              route === 'space' ? 'text-white underline underline-offset-8 decoration-[#E31937]' : ''
            }`}
          >
            Live Space
          </button>
          <button
            type="button"
            onClick={() => navigateTo('owner')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              route === 'owner' ? 'text-white underline underline-offset-8 decoration-[#E31937]' : ''
            }`}
          >
            Owner Console (/owner)
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          {route === 'owner' ? (
            <button
              type="button"
              onClick={() => navigateTo('space')}
              className="px-3.5 py-2 rounded-lg bg-[#0B1426] border border-[#A1A1A6]/40 hover:border-white text-xs font-display font-bold uppercase tracking-wider text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Visitor View
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsIntentModalOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-[#E31937] hover:bg-[#c81430] text-xs font-display font-bold uppercase tracking-wider text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Chat Elon Musk
            </button>
          )}
        </div>
      </header>

      {/* ROUTE 1: FULL-SCREEN CENTERED LANDING PORTAL */}
      {route === 'landing' && (
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12 text-center">
          <div className="max-w-4xl mx-auto flex flex-col items-center">
            {/* Circular Elon Musk Space Portrait Icon with Silver Border & Glow */}
            <div className="mb-7">
              <FounderAvatar size="xl" showVerified={true} />
            </div>

            {/* Location & Starbase Telemetry Kicker */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm text-[#D4D4D8] mb-5 font-mono">
              <span>{ownerPresence.statusText || 'Online in Starbase'}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-[#A1A1A6]">
                <MapPin className="w-3.5 h-3.5 text-[#E31937]" />
                {activeDisplayLocation}
              </span>
            </div>

            {/* Huge All-Caps Headline */}
            <h1
              className="font-display font-bold text-4xl sm:text-6xl lg:text-7xl tracking-tight uppercase text-white mb-4"
              style={{ textWrap: 'balance' }}
            >
              WELCOME TO ELON MUSK SPACE
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-xl md:text-2xl text-[#D4D4D8] font-medium tracking-wide max-w-2xl mb-10">
              Direct Line to Innovation
            </p>

            {/* Big Professional Pulsating Button: [ CHAT ELON MUSK ] */}
            <button
              type="button"
              onClick={() => setIsIntentModalOpen(true)}
              className="cta-red-glow px-9 sm:px-12 py-5 rounded-2xl bg-[#0A0A0A] border-2 border-[#E31937] text-white font-display font-bold text-base sm:text-xl tracking-[0.14em] uppercase transition-transform active:scale-95 hover:bg-[#E31937]/15 cursor-pointer"
            >
              [ CHAT ELON MUSK ]
            </button>

            {/* If visitor already has an active session, offer 1-click resume */}
            {visitorId && (
              <button
                type="button"
                onClick={() => navigateTo('space')}
                className="mt-6 text-xs sm:text-sm text-[#A1A1A6] hover:text-white underline underline-offset-4 transition-colors cursor-pointer"
              >
                Resume your active live conversation in ELON MUSK SPACE →
              </button>
            )}
          </div>
        </main>
      )}

      {/* ROUTE 2: LIVE CHAT SPACE ("ELON MUSK SPACE") */}
      {route === 'space' && (
        <main className="relative z-10 flex-1 flex flex-col w-full max-w-5xl mx-auto px-2 sm:px-6 py-3 sm:py-6">
          <div className="flex-1 flex flex-col bg-[#0A0A0A]/90 backdrop-blur-xl border border-[#A1A1A6]/30 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(11,20,38,0.9)] min-h-[600px] h-[calc(100vh-170px)]">
            {/* ELON MUSK SPACE Live Header */}
            <div className="px-4 sm:px-6 py-3.5 bg-[#0B1426]/90 border-b border-[#A1A1A6]/25 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <FounderAvatar size="md" showVerified={true} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="font-display font-bold text-sm sm:text-lg tracking-wider uppercase text-white truncate">
                      ELON MUSK SPACE
                    </h1>
                    <ShieldCheck className="w-4 h-4 text-[#E31937] shrink-0" />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#D4D4D8]">
                    <span className="font-medium text-white">
                      {ownerPresence.statusText || 'Online in Starbase'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-[#A1A1A6]">
                      <MapPin className="w-3 h-3 text-[#E31937]" />
                      {activeDisplayLocation}
                    </span>
                    {visitorRecord?.intentCategory && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#A1A1A6] uppercase">
                          {visitorRecord.intentCategory}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartNewIntent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A0A0A] border border-[#A1A1A6]/30 hover:border-white text-xs font-medium text-[#D4D4D8] hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-[#E31937]" />
                  <span>Update Intent</span>
                </button>
                <button
                  type="button"
                  onClick={toggleSound}
                  title={soundEnabled ? 'Mute Rocket Sound' : 'Unmute Rocket Sound'}
                  className="p-2 rounded-lg bg-[#0A0A0A] border border-[#A1A1A6]/30 text-[#D4D4D8] hover:text-white transition-colors cursor-pointer"
                >
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4" />
                  ) : (
                    <VolumeX className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Real-Time Chat Messages Stream (WhatsApp Style: Visitor on Right in Blue, Owner on Left) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Direct Entry Encryption / Telemetry Notice */}
              <div className="max-w-xl mx-auto text-center py-2 px-4 rounded-xl bg-[#0B1426]/60 border border-[#A1A1A6]/20 text-xs text-[#D4D4D8]">
                Direct real-time channel connected to{' '}
                <strong className="text-white">Starbase &amp; Austin Command</strong>. Your messages are delivered live with zero login friction.
              </div>

              {messages.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <p className="text-sm text-[#D4D4D8]">
                    Your live session is active ({activeDisplayLocation}). Send your message below to talk directly.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isVisitor = msg.senderRole === 'visitor';
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-end gap-2.5 ${
                        isVisitor ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {!isVisitor && <FounderAvatar size="sm" showVerified={true} />}

                      <div
                        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 ${
                          isVisitor
                            ? 'bg-[#1D4ED8] text-white rounded-br-sm shadow-[0_4px_20px_rgba(29,78,216,0.3)]'
                            : 'bg-[#0B1426] border border-[#A1A1A6]/35 text-white rounded-bl-sm shadow-[0_4px_20px_rgba(11,20,38,0.6)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-1 text-[11px] text-[#D4D4D8]">
                          <span className="font-semibold">
                            {isVisitor
                              ? `${msg.senderName} (${activeDisplayLocation})`
                              : `${msg.senderName} ✓`}
                          </span>
                          <span className="font-mono tabular-nums text-[10px] opacity-80">
                            {formatMessageTime(msg.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words text-white">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Visitor Message Input Box */}
            <form
              onSubmit={handleVisitorSendMessage}
              className="p-3 sm:p-4 bg-[#0B1426]/95 border-t border-[#A1A1A6]/25 flex items-end gap-2.5"
            >
              <textarea
                rows={2}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleVisitorSendMessage(e);
                  }
                }}
                placeholder="Write a direct message to Elon Musk Space..."
                className="flex-1 min-h-[56px] max-h-36 p-3 rounded-xl bg-[#0A0A0A] border border-[#A1A1A6]/35 focus:border-[#E31937] focus:outline-none text-white placeholder-[#A1A1A6]/70 text-sm sm:text-base resize-none"
              />
              <button
                type="submit"
                disabled={sendingMessage || !messageInput.trim()}
                className="h-[56px] px-5 sm:px-6 rounded-xl bg-[#E31937] hover:bg-[#c81430] disabled:opacity-45 text-white font-display font-bold text-xs sm:text-sm uppercase tracking-wider inline-flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 shadow-[0_0_20px_rgba(227,25,55,0.45)]"
              >
                <Rocket className="w-4 h-4" />
                <span className="hidden sm:inline">SEND</span>
                <Send className="w-3.5 h-3.5 sm:hidden" />
              </button>
            </form>
          </div>
        </main>
      )}

      {/* ROUTE 3: OWNER LIVE CONSOLE (/owner) */}
      {route === 'owner' && (
        <OwnerConsole onNavigateSpace={() => setIsIntentModalOpen(true)} />
      )}

      {/* POPUP MODAL: "What are you here for?" */}
      {isIntentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="intent-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
        >
          <div className="relative w-full max-w-2xl bg-[#0B1426] border border-[#A1A1A6]/40 rounded-2xl p-5 sm:p-8 shadow-[0_0_60px_rgba(227,25,55,0.2)] my-auto">
            <button
              type="button"
              onClick={() => setIsIntentModalOpen(false)}
              aria-label="Close modal"
              className="absolute top-4 right-4 p-2 rounded-lg bg-[#0A0A0A]/80 border border-[#A1A1A6]/25 text-[#A1A1A6] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-2">
              <FounderAvatar size="sm" showVerified={true} />
              <span className="text-xs font-mono uppercase tracking-widest text-[#A1A1A6]">
                DIRECT LINE · {activeDisplayLocation}
              </span>
            </div>

            <h2
              id="intent-modal-title"
              className="font-display font-bold text-2xl sm:text-3xl uppercase tracking-wide text-white mb-5"
            >
              What are you here for?
            </h2>

            <form onSubmit={handleContinueToSpace} className="space-y-4">
              {/* 4 Large Option Cards with Icons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {INTENT_OPTIONS.map((option) => {
                  const active = selectedIntent === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedIntent(option.id)}
                      className={`text-left p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        active
                          ? 'bg-[#0A0A0A] border-[#E31937] shadow-[0_0_24px_rgba(227,25,55,0.3)]'
                          : 'bg-[#0A0A0A]/60 border-[#A1A1A6]/25 hover:border-[#A1A1A6]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-[#0B1426] border border-[#A1A1A6]/20">
                          {option.icon}
                        </div>
                        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#A1A1A6]">
                          {option.tagLabel}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-sm sm:text-base text-white mb-1">
                          {option.title}
                        </h3>
                        <p className="text-xs text-[#D4D4D8] leading-relaxed">
                          {option.subtitle}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Optional Name & Regional Hub Selector (USA / Australia / Global) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="visitor-name-input"
                    className="block text-xs font-medium text-[#D4D4D8] mb-1"
                  >
                    Your Name (or leave blank for Anonymous)
                  </label>
                  <input
                    id="visitor-name-input"
                    type="text"
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    placeholder="Anonymous"
                    maxLength={80}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-[#A1A1A6]/35 focus:border-[#E31937] focus:outline-none text-white placeholder-[#A1A1A6]/60 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="visitor-location-display"
                    className="block text-xs font-medium text-[#D4D4D8] mb-1"
                  >
                    Location Hub (USA, Australia &amp; Global)
                  </label>
                  <select
                    id="visitor-location-display"
                    value={
                      GLOBAL_INNOVATION_HUBS.includes(detectedLocation)
                        ? detectedLocation
                        : GLOBAL_INNOVATION_HUBS[0]
                    }
                    onChange={(e) => setDetectedLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0A] border border-[#A1A1A6]/35 focus:border-[#E31937] focus:outline-none text-[#D4D4D8] text-sm"
                  >
                    {GLOBAL_INNOVATION_HUBS.map((hub) => (
                      <option key={hub} value={hub} className="bg-[#0A0A0A] text-white">
                        {hub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Text Input: "Type your intent briefly..." */}
              <div>
                <label
                  htmlFor="visitor-intent-input"
                  className="block text-xs font-medium text-[#D4D4D8] mb-1"
                >
                  Brief Intent Message
                </label>
                <input
                  id="visitor-intent-input"
                  type="text"
                  required
                  value={intentInput}
                  onChange={(e) => setIntentInput(e.target.value)}
                  placeholder="Type your intent briefly..."
                  maxLength={500}
                  className="w-full px-4 py-3.5 rounded-xl bg-[#0A0A0A] border border-[#A1A1A6]/35 focus:border-[#E31937] focus:outline-none text-white placeholder-[#A1A1A6]/70 text-sm sm:text-base"
                />
              </div>

              {/* Tesla Charging Style Progress Animation when connecting */}
              {enteringSpace && (
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full bg-[#0A0A0A] overflow-hidden rounded-full">
                    <div className="h-full w-1/2 bg-[#E31937] tesla-charge-bar" />
                  </div>
                  <p className="text-xs font-mono text-center text-[#D4D4D8]">
                    Opening direct Starbase channel...
                  </p>
                </div>
              )}

              {/* Button: [ CONTINUE TO SPACE ] */}
              <button
                type="submit"
                disabled={enteringSpace}
                className="w-full py-4 rounded-xl bg-[#E31937] hover:bg-[#c81430] disabled:opacity-50 text-white font-display font-bold text-sm sm:text-base tracking-[0.14em] uppercase transition-all cursor-pointer shadow-[0_0_28px_rgba(227,25,55,0.5)]"
              >
                {enteringSpace ? 'CONNECTING TO STARBASE...' : '[ CONTINUE TO SPACE ]'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Professional Footer */}
      <footer className="relative z-20 border-t border-[#A1A1A6]/15 bg-[#0A0A0A]/90 py-3.5 px-4 text-center text-xs text-[#A1A1A6]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© 2026 Elon Musk Space | Austin &amp; Starbase Supervised | Direct Line</span>
          <div className="flex items-center gap-4 text-[11px] text-[#D4D4D8]">
            <button
              type="button"
              onClick={() => navigateTo('landing')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Landing Portal
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => navigateTo('space')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Elon Musk Space
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => navigateTo('owner')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Owner Live Console (/owner)
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
