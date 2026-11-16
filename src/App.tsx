import { useState, useEffect, lazy, Suspense, type FormEvent } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserPopupRedirectResolver,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signOut,
  User
} from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  where,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  arrayUnion
} from 'firebase/firestore';
import { auth, db, setActiveTripId, tripCollection, tripDoc } from './firebase';
import { Trip, Member, Group, Itinerary, RollCall, TripSettings } from './types';
import TripSwitcherModal, { type TripModalTab } from './components/TripSwitcherModal';
import {
  Users,
  Calendar,
  CheckCircle,
  LayoutDashboard,
  Menu,
  X,
  Plane,
  LogIn,
  LogOut,
  ShieldCheck,
  QrCode,
  Sparkles,
  ArrowRight,
  Mail,
  FolderKanban,
  Share2,
  Plus,
  KeyRound,
  ChevronRight
} from 'lucide-react';
import { cn } from './lib/utils';
const Dashboard = lazy(() => import('./components/Dashboard'));
const MemberManagement = lazy(() => import('./components/MemberManagement'));
const ItineraryPlanner = lazy(() => import('./components/ItineraryPlanner'));
const RollCallSystem = lazy(() => import('./components/RollCallSystem'));
const FlightManager = lazy(() => import('./components/FlightManager'));

type View = 'dashboard' | 'members' | 'flights' | 'itinerary' | 'rollcall';

const LEGACY_TRIP_ID = 'legacy-main-trip';
const PENDING_JOIN_KEY = 'grouptrip_pending_join';
const ACTIVE_TRIP_STORAGE_PREFIX = 'grouptrip_active_trip_';

async function commitOperationsInChunks(
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>,
  chunkSize = 400
) {
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = writeBatch(db);
    const slice = ops.slice(i, i + chunkSize);
    slice.forEach((op) => op(batch));
    await batch.commit();
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [dataLoading, setDataLoading] = useState(false);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [activeTripId, setActiveTripState] = useState<string | null>(null);
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [tripModalTab, setTripModalTab] = useState<TripModalTab>('list');
  const [joinNotice, setJoinNotice] = useState<string | null>(null);

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [rollCalls, setRollCalls] = useState<RollCall[]>([]);
  const [tripSettings, setTripSettings] = useState<TripSettings | null>(null);

  // Sync sidebar open state across lg (1024px) breakpoint resize
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsSidebarOpen(e.matches);
    };
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  // Keep module-level active trip ID synchronized for child components
  setActiveTripId(activeTripId);

  const openTripModal = (tab: TripModalTab = 'list') => {
    setTripModalTab(tab);
    setTripModalOpen(true);
  };

  const handleSelectTrip = (tripId: string) => {
    setActiveTripId(tripId);
    setActiveTripState(tripId);
    if (user) {
      localStorage.setItem(`${ACTIVE_TRIP_STORAGE_PREFIX}${user.uid}`, tripId);
    }
  };

  // Capture ?join=CODE share links on initial page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode && joinCode.trim()) {
      sessionStorage.setItem(PENDING_JOIN_KEY, joinCode.trim().toUpperCase());
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Auth state observer + surface redirect errors
  useEffect(() => {
    getRedirectResult(auth).catch((error: any) => {
      const code = error?.code ? `[${error.code}] ` : '';
      setAuthError(`${code}${error?.message || 'Google 重新導向登入失敗。'}`);
    });
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Multi-trip workspace subscription, one-time legacy data migration & share-link auto-join
  useEffect(() => {
    if (!user) {
      setTrips([]);
      setTripsLoading(false);
      setActiveTripId(null);
      setActiveTripState(null);
      setJoinNotice(null);
      return;
    }

    let cancelled = false;
    setTripsLoading(true);

    const uidTripsMap = new Map<string, Trip>();
    const emailTripsMap = new Map<string, Trip>();
    let uidLoaded = false;
    let emailLoaded = !user.email;

    const recomputeTrips = () => {
      if (cancelled) return;
      const mergedMap = new Map<string, Trip>();
      uidTripsMap.forEach((t, id) => mergedMap.set(id, t));
      emailTripsMap.forEach((t, id) => mergedMap.set(id, t));

      const merged = Array.from(mergedMap.values()).sort((a, b) => {
        if (a.id === LEGACY_TRIP_ID && b.id !== LEGACY_TRIP_ID) return -1;
        if (b.id === LEGACY_TRIP_ID && a.id !== LEGACY_TRIP_ID) return 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });

      setTrips(merged);
      if (uidLoaded && emailLoaded) {
        setTripsLoading(false);
      }

      setActiveTripState((prev) => {
        if (prev && merged.some((t) => t.id === prev)) {
          setActiveTripId(prev);
          return prev;
        }
        const saved = localStorage.getItem(`${ACTIVE_TRIP_STORAGE_PREFIX}${user.uid}`);
        if (saved && merged.some((t) => t.id === saved)) {
          setActiveTripId(saved);
          return saved;
        }
        const fallback = merged[0]?.id || null;
        setActiveTripId(fallback);
        if (fallback) {
          localStorage.setItem(`${ACTIVE_TRIP_STORAGE_PREFIX}${user.uid}`, fallback);
        }
        return fallback;
      });
    };

    const migrateLegacyTripIfNeeded = async () => {
      try {
        const legacyTripRef = doc(db, 'trips', LEGACY_TRIP_ID);
        const legacySnap = await getDoc(legacyTripRef);
        if (legacySnap.exists()) return;

        const [rootMembersSnap, rootSettingsSnap] = await Promise.all([
          getDocs(collection(db, 'members')),
          getDoc(doc(db, 'settings', 'tripSettings'))
        ]);

        if (rootMembersSnap.empty && !rootSettingsSnap.exists()) return;

        const [rootGroupsSnap, rootItinerariesSnap, rootRollCallsSnap] = await Promise.all([
          getDocs(collection(db, 'groups')),
          getDocs(collection(db, 'itineraries')),
          getDocs(collection(db, 'rollcalls'))
        ]);

        const settingsData = rootSettingsSnap.exists()
          ? (rootSettingsSnap.data() as TripSettings)
          : null;
        const ownerEmail = (user.email || 'leo135768leo@gmail.com').toLowerCase();
        const collabEmails = Array.from(new Set([ownerEmail, 'leo135768leo@gmail.com']));
        const nowIso = new Date().toISOString();

        // Create parent trip doc first so subcollection security rules allow writing child docs
        await setDoc(legacyTripRef, {
          id: LEGACY_TRIP_ID,
          name: '2026 團體旅遊（原預設行程）',
          description: '由既有團員與行程資料獨立保留之旅遊行程',
          startDate: settingsData?.startDate || '2026-05-01',
          endDate: settingsData?.endDate || '2026-05-09',
          ownerId: user.uid,
          ownerEmail,
          ownerName: user.displayName || ownerEmail,
          memberUids: [user.uid],
          collaboratorEmails: collabEmails,
          inviteCode: 'GT2026',
          createdAt: nowIso,
          updatedAt: nowIso
        });

        const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
        if (rootSettingsSnap.exists()) {
          const settingsPayload = rootSettingsSnap.data();
          ops.push((batch) => {
            batch.set(tripDoc('settings', 'tripSettings', LEGACY_TRIP_ID), settingsPayload);
          });
        }
        rootGroupsSnap.forEach((d) => {
          const data = d.data();
          ops.push((batch) => {
            batch.set(tripDoc('groups', d.id, LEGACY_TRIP_ID), data);
          });
        });
        rootMembersSnap.forEach((d) => {
          const data = d.data();
          ops.push((batch) => {
            batch.set(tripDoc('members', d.id, LEGACY_TRIP_ID), data);
          });
        });
        rootItinerariesSnap.forEach((d) => {
          const data = d.data();
          ops.push((batch) => {
            batch.set(tripDoc('itineraries', d.id, LEGACY_TRIP_ID), data);
          });
        });
        rootRollCallsSnap.forEach((d) => {
          const data = d.data();
          ops.push((batch) => {
            batch.set(tripDoc('rollcalls', d.id, LEGACY_TRIP_ID), data);
          });
        });

        await commitOperationsInChunks(ops, 400);
      } catch (err) {
        console.error('Legacy trip migration check failed:', err);
      }
    };

    const handlePendingJoinLink = async () => {
      const pendingCode = sessionStorage.getItem(PENDING_JOIN_KEY);
      if (!pendingCode) return;
      sessionStorage.removeItem(PENDING_JOIN_KEY);
      try {
        const snap = await getDocs(
          query(collection(db, 'trips'), where('inviteCode', '==', pendingCode))
        );
        if (snap.empty) {
          if (!cancelled) setJoinNotice(`邀請碼「${pendingCode}」無效或行程已不存在。`);
          return;
        }
        const targetDoc = snap.docs[0];
        const updates: Record<string, any> = {
          memberUids: arrayUnion(user.uid),
          updatedAt: new Date().toISOString()
        };
        if (user.email) {
          updates.collaboratorEmails = arrayUnion(user.email.toLowerCase());
        }
        await updateDoc(doc(db, 'trips', targetDoc.id), updates);
        if (!cancelled) {
          localStorage.setItem(`${ACTIVE_TRIP_STORAGE_PREFIX}${user.uid}`, targetDoc.id);
          setActiveTripId(targetDoc.id);
          setActiveTripState(targetDoc.id);
          setJoinNotice(`已透過邀請碼加入「${(targetDoc.data() as Trip).name}」！`);
        }
      } catch (err) {
        console.error('Auto-join via invite link failed:', err);
      }
    };

    void (async () => {
      await migrateLegacyTripIfNeeded();
      await handlePendingJoinLink();
    })();

    const unsubUidTrips = onSnapshot(
      query(collection(db, 'trips'), where('memberUids', 'array-contains', user.uid)),
      (snapshot) => {
        uidTripsMap.clear();
        snapshot.docs.forEach((d) => {
          uidTripsMap.set(d.id, { ...d.data(), id: d.id } as Trip);
        });
        uidLoaded = true;
        recomputeTrips();
      },
      (error) => {
        console.error('Failed to subscribe uid trips:', error.message);
        uidLoaded = true;
        recomputeTrips();
      }
    );

    const userEmailLower = user.email?.trim().toLowerCase();
    const unsubEmailTrips = userEmailLower
      ? onSnapshot(
          query(collection(db, 'trips'), where('collaboratorEmails', 'array-contains', userEmailLower)),
          (snapshot) => {
            emailTripsMap.clear();
            snapshot.docs.forEach((d) => {
              emailTripsMap.set(d.id, { ...d.data(), id: d.id } as Trip);
            });
            emailLoaded = true;
            recomputeTrips();
          },
          (error) => {
            console.error('Failed to subscribe email trips:', error.message);
            emailLoaded = true;
            recomputeTrips();
          }
        )
      : () => {};

    return () => {
      cancelled = true;
      unsubUidTrips();
      unsubEmailTrips();
    };
  }, [user]);

  // Real-time trip-scoped data sync (authenticated users + activeTripId only)
  useEffect(() => {
    if (!user || !activeTripId) {
      setMembers([]);
      setGroups([]);
      setItineraries([]);
      setRollCalls([]);
      setTripSettings(null);
      setDataLoading(false);
      return;
    }

    setActiveTripId(activeTripId);
    setDataLoading(true);
    setMembers([]);
    setGroups([]);
    setItineraries([]);
    setRollCalls([]);
    setTripSettings(null);
    let membersLoaded = false;

    const unsubMembers = onSnapshot(
      tripCollection('members', activeTripId),
      (snapshot) => {
        setMembers(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Member)));
        membersLoaded = true;
        setDataLoading(false);
      },
      (error) => {
        console.error('Failed to subscribe members:', error.message);
        if (!membersLoaded) setDataLoading(false);
      }
    );

    const unsubGroups = onSnapshot(
      tripCollection('groups', activeTripId),
      (snapshot) => {
        setGroups(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Group)));
      },
      (error) => {
        console.error('Failed to subscribe groups:', error.message);
      }
    );

    const unsubItineraries = onSnapshot(
      query(tripCollection('itineraries', activeTripId), orderBy('startTime', 'asc')),
      (snapshot) => {
        setItineraries(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Itinerary)));
      },
      (error) => {
        console.error('Failed to subscribe itineraries:', error.message);
      }
    );

    const unsubRollCalls = onSnapshot(
      tripCollection('rollcalls', activeTripId),
      (snapshot) => {
        setRollCalls(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as RollCall)));
      },
      (error) => {
        console.error('Failed to subscribe rollcalls:', error.message);
      }
    );

    const unsubSettings = onSnapshot(
      tripDoc('settings', 'tripSettings', activeTripId),
      (docSnap) => {
        if (docSnap.exists()) {
          setTripSettings(docSnap.data() as TripSettings);
        } else {
          setTripSettings(null);
        }
      },
      (error) => {
        console.error('Failed to subscribe tripSettings:', error.message);
      }
    );

    return () => {
      unsubMembers();
      unsubGroups();
      unsubItineraries();
      unsubRollCalls();
      unsubSettings();
    };
  }, [user, activeTripId]);

  const handleLogin = async () => {
    setAuthError(null);
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
          return;
        } catch (redirectError: any) {
          const rCode = redirectError?.code ? `[${redirectError.code}] ` : '';
          setAuthError(`${rCode}${redirectError?.message || 'Google 登入失敗，請稍後再試。'}`);
        }
      } else if (code !== 'auth/popup-closed-by-user') {
        const prefix = code ? `[${code}] ` : '';
        setAuthError(`${prefix}${error?.message || 'Google 登入失敗，請確認網域權限或網路連線。'}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput) {
      setAuthError('請輸入電子郵件與密碼。');
      return;
    }
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
    } catch (error: any) {
      const code = error?.code ? `[${error.code}] ` : '';
      setAuthError(`${code}${error?.message || 'Email 登入失敗，請確認帳號密碼與登入方式設定。'}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const navItems = [
    { id: 'dashboard', label: '總覽儀表板', icon: LayoutDashboard },
    { id: 'members', label: '名單管理', icon: Users },
    { id: 'flights', label: '航班資訊', icon: Plane },
    { id: 'itinerary', label: '行程規劃', icon: Calendar },
    { id: 'rollcall', label: '點名系統', icon: CheckCircle },
  ];

  // Glassmorphism + Shimmer Loading State
  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="glass-panel w-full max-w-md rounded-2xl lg:rounded-3xl p-8 shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl skeleton-shimmer" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-36 rounded-lg skeleton-shimmer" />
              <div className="h-3 w-24 rounded-lg skeleton-shimmer" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-12 w-full rounded-xl skeleton-shimmer" />
            <div className="h-12 w-5/6 rounded-xl skeleton-shimmer" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-stone-500 text-center">
            正在驗證登入狀態...
          </p>
        </div>
      </div>
    );
  }

  // Public Introduction Landing Page when unauthenticated
  if (!user) {
    const featureHighlights = [
      {
        icon: LayoutDashboard,
        title: '總覽儀表板',
        desc: '即時統計 9 天 / 5 天 / 3 天行程人數、性別比例與各小組組長配置。',
      },
      {
        icon: Users,
        title: '名單與分組管理',
        desc: '支援 CSV / Excel 批次匯入匯出、電話與特殊需求備註、組長指派與 QR Code 產出。',
      },
      {
        icon: Plane,
        title: '航班動態追蹤',
        desc: '依去程與回程航班自動分組統計人數，一鍵篩選尚未填寫航班與在地團員。',
      },
      {
        icon: Calendar,
        title: '行程分車分房規劃',
        desc: '逐日時間軸排版，支援全員／脫隊活動、多車乘車名單與多房住宿配置。',
      },
      {
        icon: QrCode,
        title: 'QR Code 點名與桌位系統',
        desc: '現場鏡頭掃描快速報到、每日缺勤同步扣除，搭配餐飲桌次座位交換視圖。',
      },
    ];

    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 relative overflow-x-hidden flex flex-col">
        {/* Decorative ambient glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#00F3FF]/15 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-stone-900/5 blur-3xl" />
        </div>

        {/* Top Header */}
        <header className="relative z-10 max-w-6xl w-full mx-auto px-6 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-stone-900 text-white flex items-center justify-center shadow-lg border border-white/20">
              <Sparkles className="w-5 h-5 text-[#00F3FF]" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold tracking-tight">GroupTrip Pro</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                團體旅遊管理系統
              </p>
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="spring-interactive inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-stone-900 text-white text-sm font-bold shadow-md hover:bg-stone-800 disabled:opacity-60 whitespace-nowrap"
          >
            <LogIn className="w-4 h-4 text-[#00F3FF]" />
            {isLoggingIn ? '登入中...' : 'Google 登入'}
          </button>
        </header>

        {/* Main Hero & Feature Section */}
        <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 py-8 lg:py-14 space-y-12">
          <section className="glass-panel rounded-2xl lg:rounded-3xl p-8 lg:p-12 shadow-xl border border-white/60">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-900 text-white text-xs font-bold tracking-wider">
                <span className="w-2 h-2 rounded-full bg-[#00F3FF] animate-pulse" />
                Enterprise Group Travel OS
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-semibold text-stone-900 leading-tight">
                專為百人大型旅遊團打造的
                <span className="block mt-1 text-stone-700">即時名單、航班、行程與點名平台</span>
              </h2>

              <p className="text-base sm:text-lg text-stone-600 leading-relaxed">
                整合團員名冊與特殊飲食／醫療備註、航班去回程分流、每日行程分車分房調度，以及現場 QR Code 掃描報到與餐廳桌次配置，讓領隊與工作人員即時掌握全團動態。
              </p>

              {authError && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                  登入失敗：{authError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2">
                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="spring-interactive inline-flex items-center justify-center gap-3 px-7 py-4 rounded-2xl bg-stone-900 text-white font-bold text-base shadow-xl hover:bg-stone-800 disabled:opacity-60 cursor-pointer"
                >
                  <LogIn className="w-5 h-5 text-[#00F3FF]" />
                  <span>{isLoggingIn ? '正在連接 Google...' : '使用 Google 帳號登入開始使用'}</span>
                  <ArrowRight className="w-4 h-4 opacity-70" />
                </button>

                <div className="flex items-center gap-2 text-xs font-medium text-stone-600 px-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>團員護照與聯絡電話等個資已受 Firebase 登入權限保護</span>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowEmailLogin(prev => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-900 underline underline-offset-4 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {showEmailLogin ? '收合 Email／密碼登入' : '無法使用 Google 彈窗？改用 Email／密碼登入'}
                </button>

                {showEmailLogin && (
                  <form onSubmit={handleEmailLogin} className="mt-4 p-5 rounded-2xl bg-white/80 border border-stone-200 max-w-md space-y-3 shadow-sm">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Email 帳號</label>
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="leader@example.com"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-stone-500">密碼</label>
                      <input
                        type="password"
                        required
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full py-2.5 rounded-xl bg-stone-900 text-white text-sm font-bold hover:bg-stone-800 disabled:opacity-60 cursor-pointer"
                    >
                      {isLoggingIn ? '登入中...' : '使用 Email 登入'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-serif font-semibold text-stone-900">核心功能模組</h3>
              <span className="text-xs font-bold uppercase tracking-widest text-stone-500">
                Sign In Required
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {featureHighlights.map((item) => (
                <div
                  key={item.title}
                  className="glass-panel spring-interactive rounded-2xl lg:rounded-3xl p-6 shadow-sm border border-stone-200/80 flex flex-col gap-3"
                >
                  <div className="w-11 h-11 rounded-2xl bg-stone-900 text-[#00F3FF] flex items-center justify-center shadow-sm">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <h4 className="text-lg font-bold text-stone-900">{item.title}</h4>
                  <p className="text-sm text-stone-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  const activeTrip = trips.find((t) => t.id === activeTripId) || null;

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-stone-200 transition-transform duration-300 lg:static lg:translate-x-0 lg:flex-shrink-0",
          !isSidebarOpen && "-translate-x-full lg:hidden"
        )}
      >
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-serif font-medium">GroupTrip Pro</h1>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-stone-100 rounded-full transition-colors"
              aria-label="關閉選單"
            >
              <X className="w-5 h-5 text-stone-500 hover:text-stone-900" />
            </button>
          </div>

          {/* Current Trip Switcher Card */}
          <div className="mb-6 p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-black uppercase tracking-widest text-stone-400 block">
                  目前行程 ({trips.length})
                </span>
                <p className="text-sm font-bold text-stone-900 truncate mt-0.5" title={activeTrip?.name || ''}>
                  {activeTrip?.name || (tripsLoading ? '讀取中...' : '尚未選擇行程')}
                </p>
                <p className="text-[11px] font-medium text-stone-500 truncate">
                  {activeTrip ? `${activeTrip.startDate} ~ ${activeTrip.endDate}` : '請建立或加入行程'}
                </p>
              </div>
              <FolderKanban className="w-4 h-4 text-stone-400 flex-shrink-0 mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => openTripModal('list')}
                className="px-2.5 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-bold text-stone-700 hover:border-stone-400 transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                切換 / 管理
                <ChevronRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => openTripModal(activeTrip ? 'share' : 'create')}
                className="px-2.5 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Share2 className="w-3 h-3 text-[#00F3FF]" />
                {activeTrip ? '共用邀請' : '建立行程'}
              </button>
            </div>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id as View);
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  currentView === item.id
                    ? "bg-stone-900 text-white shadow-lg"
                    : "text-stone-600 hover:bg-stone-100"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>

          {/* User Profile & Logout */}
          <div className="pt-6 border-t border-stone-100 space-y-3">
            <div className="flex items-center gap-3 px-2">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || '使用者'}
                  className="w-9 h-9 rounded-full border border-stone-200 object-cover flex-shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 truncate">
                  {user.displayName || '管理員'}
                </p>
                <p className="text-xs text-stone-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              登出系統
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-4 sm:px-6 lg:hidden shrink-0 gap-2">
          <div className="flex items-center min-w-0 flex-1">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 hover:bg-stone-100 rounded-xl transition-colors flex-shrink-0"
              aria-label="開啟選單"
            >
              <Menu className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => openTripModal('list')}
              className="ml-2 min-w-0 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-stone-200/70 transition-colors text-left"
              title="切換或管理行程"
            >
              <FolderKanban className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
              <span className="text-sm font-bold text-stone-900 truncate max-w-[140px]">
                {activeTrip?.name || 'GroupTrip Pro'}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {activeTrip && (
              <button
                type="button"
                onClick={() => openTripModal('share')}
                className="p-2 rounded-xl text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors"
                title="共用邀請"
                aria-label="共用邀請"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
              title="登出系統"
            >
              <LogOut className="w-3.5 h-3.5" />
              登出
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-10">
          {joinNotice && (
            <div className="mb-6 p-4 rounded-2xl bg-stone-900 text-white text-sm font-bold flex items-center justify-between gap-4 shadow-md">
              <span>{joinNotice}</span>
              <button
                type="button"
                onClick={() => setJoinNotice(null)}
                className="p-1 rounded-full hover:bg-white/10"
                aria-label="關閉通知"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {(tripsLoading || (activeTripId && dataLoading)) && (
            <div className="mb-6 p-4 rounded-2xl glass-panel border border-[#00F3FF]/30 flex items-center gap-4">
              <div className="w-8 h-8 rounded-xl skeleton-shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 rounded skeleton-shimmer" />
                <div className="h-2.5 w-64 max-w-full rounded skeleton-shimmer" />
              </div>
            </div>
          )}

          {!tripsLoading && trips.length === 0 ? (
            <div className="max-w-3xl mx-auto py-8 space-y-6">
              <div className="glass-panel rounded-3xl p-8 border border-stone-200/80 shadow-sm space-y-2 text-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-900 text-[#00F3FF] text-[10px] font-black uppercase tracking-widest">
                  Multi-Trip Workspace
                </span>
                <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-stone-900">
                  歡迎來到多行程管理空間
                </h2>
                <p className="text-sm text-stone-500">
                  您可以建立專屬的新旅遊團（所有團員與行程完全獨立），或輸入夥伴分享的邀請碼加入共編。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <button
                  type="button"
                  onClick={() => openTripModal('create')}
                  className="glass-panel spring-interactive p-7 rounded-3xl border border-stone-200 text-left space-y-3 hover:border-stone-400 cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-2xl bg-stone-900 text-[#00F3FF] flex items-center justify-center shadow-md">
                    <Plus className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-serif font-bold text-stone-900">建立第一個新行程</h3>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    設定旅遊名稱、日期並自動取得專屬邀請碼，立即開始匯入團員與規劃行程。
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => openTripModal('join')}
                  className="glass-panel spring-interactive p-7 rounded-3xl border border-stone-200 text-left space-y-3 hover:border-stone-400 cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-900 flex items-center justify-center">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-serif font-bold text-stone-900">輸入邀請碼加入行程</h3>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    輸入團隊夥伴提供的 6 碼邀請碼，立刻同步檢視與共同編輯該團資料。
                  </p>
                </button>
              </div>
            </div>
          ) : activeTripId ? (
            <Suspense
              key={activeTripId}
              fallback={
                <div className="p-8 rounded-3xl glass-panel border border-stone-200/80 space-y-4">
                  <div className="h-8 w-48 rounded-xl skeleton-shimmer" />
                  <div className="h-64 w-full rounded-2xl skeleton-shimmer" />
                </div>
              }
            >
              {currentView === 'dashboard' && (
                <Dashboard
                  members={members}
                  itineraries={itineraries}
                  rollCalls={rollCalls}
                  groups={groups}
                />
              )}
              {currentView === 'members' && (
                <MemberManagement
                  members={members}
                  groups={groups}
                  itineraries={itineraries}
                  tripSettings={tripSettings}
                />
              )}
              {currentView === 'flights' && (
                <FlightManager
                  members={members}
                  groups={groups}
                />
              )}
              {currentView === 'itinerary' && (
                <ItineraryPlanner
                  itineraries={itineraries}
                  members={members}
                  groups={groups}
                  tripSettings={tripSettings}
                />
              )}
              {currentView === 'rollcall' && (
                <RollCallSystem
                  rollCalls={rollCalls}
                  itineraries={itineraries}
                  members={members}
                  tripSettings={tripSettings}
                  groups={groups}
                />
              )}
            </Suspense>
          ) : null}
        </div>
      </main>

      <TripSwitcherModal
        isOpen={tripModalOpen}
        initialTab={tripModalTab}
        onClose={() => setTripModalOpen(false)}
        trips={trips}
        activeTrip={activeTrip}
        onSelectTrip={handleSelectTrip}
        currentUser={user}
      />
    </div>
  );
}
