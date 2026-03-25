import { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithRedirect, 
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
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Member, Group, Itinerary, RollCall } from './types';
import { 
  Users, 
  Calendar, 
  CheckCircle, 
  LayoutDashboard, 
  LogOut, 
  LogIn,
  Menu,
  X
} from 'lucide-react';
import { cn } from './lib/utils';
import Dashboard from './components/Dashboard';
import MemberManagement from './components/MemberManagement';
import ItineraryPlanner from './components/ItineraryPlanner';
import RollCallSystem from './components/RollCallSystem';

type View = 'dashboard' | 'members' | 'itinerary' | 'rollcall';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [rollCalls, setRollCalls] = useState<RollCall[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Test connection to Firestore
  useEffect(() => {
    if (user) {
      const testConnection = async () => {
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
          }
        }
      };
      testConnection();
    }
  }, [user]);

  // Real-time data sync
  useEffect(() => {
    if (!user) return;

    const unsubMembers = onSnapshot(collection(db, 'members'), (snapshot) => {
      setMembers(snapshot.docs.map(doc => ({ ...doc.data() } as Member)));
    });

    const unsubGroups = onSnapshot(collection(db, 'groups'), (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ ...doc.data() } as Group)));
    });

    const unsubItineraries = onSnapshot(query(collection(db, 'itineraries'), orderBy('startTime', 'asc')), (snapshot) => {
      setItineraries(snapshot.docs.map(doc => ({ ...doc.data() } as Itinerary)));
    });

    const unsubRollCalls = onSnapshot(collection(db, 'rollcalls'), (snapshot) => {
      setRollCalls(snapshot.docs.map(doc => ({ ...doc.data() } as RollCall)));
    });

    return () => {
      unsubMembers();
      unsubGroups();
      unsubItineraries();
      unsubRollCalls();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-stone-800"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-sm border border-stone-200 text-center">
          <h1 className="text-4xl font-serif font-light mb-2">GroupTrip Pro</h1>
          <p className="text-stone-500 mb-8">Professional management for large group travel.</p>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white rounded-full py-3 px-6 hover:bg-stone-800 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'itinerary', label: 'Itinerary', icon: Calendar },
    { id: 'rollcall', label: 'Roll Call', icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-stone-200 transition-transform duration-300 lg:relative lg:translate-x-0",
          !isSidebarOpen && "-translate-x-full lg:hidden"
        )}
      >
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center justify-between mb-10">
            <h1 className="text-xl font-serif font-medium">GroupTrip Pro</h1>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as View)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  currentView === item.id 
                    ? "bg-stone-900 text-white" 
                    : "text-stone-600 hover:bg-stone-100"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="pt-6 border-t border-stone-100">
            <div className="flex items-center gap-3 px-4 mb-4">
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                alt={user.displayName || 'User'} 
                className="w-8 h-8 rounded-full border border-stone-200"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.displayName}</p>
                <p className="text-xs text-stone-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 bg-white border-bottom border-stone-200 flex items-center px-6 lg:hidden">
          <button onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="ml-4 text-lg font-serif font-medium">GroupTrip Pro</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          {currentView === 'dashboard' && (
            <Dashboard 
              members={members} 
              itineraries={itineraries} 
              rollCalls={rollCalls} 
            />
          )}
          {currentView === 'members' && (
            <MemberManagement 
              members={members} 
              groups={groups} 
            />
          )}
          {currentView === 'itinerary' && (
            <ItineraryPlanner 
              itineraries={itineraries} 
              members={members} 
            />
          )}
          {currentView === 'rollcall' && (
            <RollCallSystem 
              rollCalls={rollCalls} 
              itineraries={itineraries} 
              members={members} 
            />
          )}
        </div>
      </main>
    </div>
  );
}
