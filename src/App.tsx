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
  doc
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Member, Group, Itinerary, RollCall, TripSettings } from './types';
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
  Mail
} from 'lucide-react';
import { cn } from './lib/utils';
const Dashboard = lazy(() => import('./components/Dashboard'));
const MemberManagement = lazy(() => import('./components/MemberManagement'));
const ItineraryPlanner = lazy(() => import('./components/ItineraryPlanner'));
const RollCallSystem = lazy(() => import('./components/RollCallSystem'));
const FlightManager = lazy(() => import('./components/FlightManager'));

type View = 'dashboard' | 'members' | 'flights' | 'itinerary' | 'rollcall';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [dataLoading, setDataLoading] = useState(false);

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

  // Real-time data sync (authenticated users only)
  useEffect(() => {
    if (!user) {
      setMembers([]);
      setGroups([]);
      setItineraries([]);
      setRollCalls([]);
      setTripSettings(null);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    let membersLoaded = false;

    const unsubMembers = onSnapshot(
      collection(db, 'members'),
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
      collection(db, 'groups'),
      (snapshot) => {
        setGroups(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Group)));
      },
      (error) => {
        console.error('Failed to subscribe groups:', error.message);
      }
    );

    const unsubItineraries = onSnapshot(
      query(collection(db, 'itineraries'), orderBy('startTime', 'asc')),
      (snapshot) => {
        setItineraries(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Itinerary)));
      },
      (error) => {
        console.error('Failed to subscribe itineraries:', error.message);
      }
    );

    const unsubRollCalls = onSnapshot(
      collection(db, 'rollcalls'),
      (snapshot) => {
        setRollCalls(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as RollCall)));
      },
      (error) => {
        console.error('Failed to subscribe rollcalls:', error.message);
      }
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'tripSettings'),
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
  }, [user]);

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
          <div className="flex items-center justify-between mb-10">
            <h1 className="text-xl font-serif font-medium">GroupTrip Pro</h1>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-stone-100 rounded-full transition-colors"
              aria-label="關閉選單"
            >
              <X className="w-5 h-5 text-stone-500 hover:text-stone-900" />
            </button>
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
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-4 sm:px-6 lg:hidden shrink-0">
          <div className="flex items-center">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 hover:bg-stone-100 rounded-xl transition-colors"
              aria-label="開啟選單"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="ml-3 text-lg font-serif font-medium">GroupTrip Pro</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
            title="登出系統"
          >
            <LogOut className="w-3.5 h-3.5" />
            登出
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-10">
          {dataLoading && (
            <div className="mb-6 p-4 rounded-2xl glass-panel border border-[#00F3FF]/30 flex items-center gap-4">
              <div className="w-8 h-8 rounded-xl skeleton-shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 rounded skeleton-shimmer" />
                <div className="h-2.5 w-64 max-w-full rounded skeleton-shimmer" />
              </div>
            </div>
          )}

          <Suspense
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
        </div>
      </main>
    </div>
  );
}
