const fs = require('fs');

let content = fs.readFileSync('src/components/RollCallSystem.tsx', 'utf8');

const importsToAdd = `
import QRCodeDisplay from './QRCodeDisplay';
import QRScanner from './QRScanner';
import { auth } from '../firebase';
`;
content = content.replace(`import TableSeating from './TableSeating';`, `import TableSeating from './TableSeating';${importsToAdd}`);

content = content.replace(`Trash2\n} from 'lucide-react';`, `Trash2,\n  QrCode,\n  ScanLine\n} from 'lucide-react';`);

const startStr = `  const [viewMode, setViewMode] = useState<'list' | 'seating'>('list');`;
const stateReplacement = `  const [viewMode, setViewMode] = useState<'list' | 'seating'>('list');
  const [activeTab, setActiveTab] = useState<'manual' | 'showQR' | 'scanQR'>('manual');

  const isLeader = useMemo(() => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return false;
    const currentMember = members.find(m => m.id === currentUid);
    return currentMember?.isLeader || false;
  }, [members, auth.currentUser?.uid]);
`;
content = content.replace(startStr, stateReplacement);

const uiSearch = `              <div className="flex-1 bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col h-full min-h-0">
                <div className="flex items-center justify-between mb-6 gap-4">
                  <div className="flex items-center gap-4 flex-1">`;

const uiReplacement = `              <div className="flex-1 bg-white border border-stone-200 rounded-3xl shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
                <div className="flex border-b border-stone-200 flex-shrink-0">
                  <button
                    onClick={() => setActiveTab('manual')}
                    className={cn(
                      "flex-1 py-4 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2",
                      activeTab === 'manual' ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-700"
                    )}
                  >
                    <UserCheck className="w-4 h-4" />
                    手動點名
                  </button>
                  <button
                    onClick={() => setActiveTab('showQR')}
                    className={cn(
                      "flex-1 py-4 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2",
                      activeTab === 'showQR' ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-700"
                    )}
                  >
                    <QrCode className="w-4 h-4" />
                    出示QR Code
                  </button>
                  {isLeader && (
                    <button
                      onClick={() => setActiveTab('scanQR')}
                      className={cn(
                        "flex-1 py-4 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2",
                        activeTab === 'scanQR' ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-700"
                      )}
                    >
                      <ScanLine className="w-4 h-4" />
                      掃描QR Code
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                  {activeTab === 'showQR' && (
                    <div className="flex-1 overflow-y-auto flex items-center justify-center">
                      <QRCodeDisplay memberId={auth.currentUser?.uid} />
                    </div>
                  )}

                  {activeTab === 'scanQR' && selectedItineraryId && (
                    <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center">
                      <h2 className="text-xl font-bold mb-4">掃描成員 QR Code</h2>
                      <p className="text-stone-500 mb-6">掃描後自動記錄為「已出席」</p>
                      <QRScanner itineraryId={selectedItineraryId} />
                    </div>
                  )}

                  {activeTab === 'manual' && (
                    <div className="flex-1 flex flex-col h-full min-h-0">
                      <div className="flex items-center justify-between mb-6 gap-4">
                        <div className="flex items-center gap-4 flex-1">`;

content = content.replace(uiSearch, uiReplacement);

const uiCloseSearch = `                    {filteredMembers.length === 0 && (
                        <div className="p-12 text-center text-stone-400">
                          找不到相關團員
                        </div>
                      )}
                  </div>
                  )}
                </div>
              </>
            ) : (`;

const uiCloseReplacement = `                    {filteredMembers.length === 0 && (
                        <div className="p-12 text-center text-stone-400">
                          找不到相關團員
                        </div>
                      )}
                  </div>
                  )}
                    </div>
                  )}
                </div>
              </div>
            ) : (`;

content = content.replace(uiCloseSearch, uiCloseReplacement);

fs.writeFileSync('src/components/RollCallSystem.tsx', content);
