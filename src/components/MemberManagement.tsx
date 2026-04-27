import React, { useState } from 'react';
import { Member, Group, Itinerary, TripSettings } from '../types';
import { 
  Plus, 
  Upload, 
  Download, 
  Search, 
  Trash2, 
  Edit2, 
  UserPlus,
  Filter,
  MoreVertical,
  X,
  Check,
  Users,
  Crown,
  Calendar,
  Square,
  CheckSquare,
  Plane
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import * as XLSX from 'xlsx';
import { cn, getMemberTripDayColor } from '../lib/utils';
import PersonalItineraryModal from './PersonalItineraryModal';

interface MemberManagementProps {
  members: Member[];
  groups: Group[];
  itineraries: Itinerary[];
  tripSettings: TripSettings | null;
}

export default function MemberManagement({ members, groups, itineraries, tripSettings }: MemberManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isManagingGroups, setIsManagingGroups] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [viewingItineraryMember, setViewingItineraryMember] = useState<Member | null>(null);
  const [isFlightExpanded, setIsFlightExpanded] = useState(false);

  const [newMember, setNewMember] = useState<Partial<Member>>({
    name: '',
    dietaryHabits: '',
    passportInfo: '',
    groupId: '',
    tags: [],
    outboundFlight: '',
    outboundTime: '',
    returnFlight: '',
    returnTime: '',
    isLeader: false,
    gender: '',
    tripDays: undefined
  });

  const processTagsForTripDays = (tags: string[], currentTripDays?: number) => {
    // Match digits followed by '天', 'D', or 'd'
    const tripDayTag = tags.find(t => /\d+[天dD]$/i.test(t.trim()));
    if (!tripDayTag) return { tags, tripDays: currentTripDays };

    const match = tripDayTag.match(/\d+/);
    if (!match) return { tags, tripDays: currentTripDays };

    const extractedDays = parseInt(match[0]);
    if (isNaN(extractedDays)) return { tags, tripDays: currentTripDays };

    return {
      tags: tags.filter(t => t !== tripDayTag),
      tripDays: extractedDays
    };
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.name) return;

    try {
      const { tags: processedTags, tripDays: processedDays } = processTagsForTripDays(newMember.tags || [], newMember.tripDays);

      const docRef = await addDoc(collection(db, 'members'), {
        ...newMember,
        tags: processedTags,
        tripDays: processedDays,
        id: Date.now().toString(), // Temporary ID, Firestore will generate its own
      });
      await updateDoc(docRef, { id: docRef.id });
      setIsAddingMember(false);
      setNewMember({ name: '', dietaryHabits: '', passportInfo: '', groupId: '', tags: [], outboundFlight: '', outboundTime: '', returnFlight: '', returnTime: '', isLeader: false, gender: '', tripDays: undefined });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'members');
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !editingMember.name) return;

    try {
      const { tags: processedTags, tripDays: processedDays } = processTagsForTripDays(editingMember.tags || [], editingMember.tripDays);
      const memberRef = doc(db, 'members', editingMember.id);
      await updateDoc(memberRef, { 
        ...editingMember,
        tags: processedTags,
        tripDays: processedDays
      });
      setEditingMember(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `members/${editingMember.id}`);
    }
  };

  const handleDeleteMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'members', id));
      setSelectedMemberIds(prev => prev.filter(mid => mid !== id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `members/${id}`);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedMemberIds.length === 0) return;

    try {
      const batch = writeBatch(db);
      selectedMemberIds.forEach(id => {
        batch.delete(doc(db, 'members', id));
      });
      await batch.commit();
      setSelectedMemberIds([]);
      setIsDeletingAll(false);
    } catch (error) {
      console.error("Batch delete failed:", error);
      handleFirestoreError(error, OperationType.DELETE, "batch");
    }
  };

  const toggleSelectAll = () => {
    if (selectedMemberIds.length === filteredMembers.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(filteredMembers.map(m => m.id));
    }
  };

  const toggleSelectMember = (id: string) => {
    setSelectedMemberIds(prev => 
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    try {
      const docRef = await addDoc(collection(db, 'groups'), {
        name: newGroupName,
        id: Date.now().toString()
      });
      await updateDoc(docRef, { id: docRef.id });
      setNewGroupName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'groups');
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || !editingGroup.name) return;
    try {
      await updateDoc(doc(db, 'groups', editingGroup.id), { name: editingGroup.name });
      setEditingGroup(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${editingGroup.id}`);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'groups', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${id}`);
    }
  };

  const handleQuickGroupChange = async (memberId: string, newGroupId: string) => {
    try {
      const memberRef = doc(db, 'members', memberId);
      await updateDoc(memberRef, { groupId: newGroupId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `members/${memberId}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let wb;
      if (file.name.toLowerCase().endsWith('.csv')) {
        wb = XLSX.read(evt.target?.result, { type: 'string' });
      } else {
        const buffer = evt.target?.result as ArrayBuffer;
        wb = XLSX.read(buffer, { type: 'array' });
      }
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const batch = writeBatch(db);
      let importedCount = 0;
      data.forEach((row) => {
        // Handle potential exact match of keys and BOM characters
        const name = row['Name'] || row['姓名'] || row['\uFEFF姓名'] || '';
        const dietary = row['Dietary'] || row['飲食'] || '';
        const passport = row['Passport'] || row['護照'] || '';
        const group = row['Group'] || row['組別'] || '';
        const tags = row['Tags'] || row['tags'] || row['備註'] || row['備注'] || '';
        const outboundFlight = row['OutboundFlight'] || row['去程航班'] || '';
        const outboundTime = row['OutboundTime'] || row['去程時間'] || '';
        const returnFlight = row['ReturnFlight'] || row['回程航班'] || '';
        const returnTime = row['ReturnTime'] || row['回程時間'] || '';

        // Skip completely empty rows
        if (!name) return;

        const rawTags = typeof tags === 'string' && tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const rawDays = Number(row['TripDays'] || row['天數'] || row['行程天數']) || undefined;
        
        const { tags: processedTags, tripDays: processedDays } = processTagsForTripDays(rawTags, rawDays);

        const newDocRef = doc(collection(db, 'members'));
        batch.set(newDocRef, {
          id: newDocRef.id,
          name: name,
          dietaryHabits: dietary,
          passportInfo: passport,
          groupId: group,
          tags: processedTags,
          outboundFlight,
          outboundTime,
          returnFlight,
          returnTime,
          isLeader: row['IsLeader'] === 'true' || row['組長'] === '是' || false,
          gender: row['Gender'] || row['性別'] || row['男女'] || '',
          tripDays: processedDays
        });
        importedCount++;
      });

      try {
        if (importedCount === 0) {
          alert(`沒有找到可匯入的有效名單！讀取到的總列數：${data.length}。請確認檔案格式或表頭。`);
          return;
        }
        await batch.commit();
        alert(`成功匯入了 ${importedCount} 位成員！`);
      } catch (error) {
        console.error("Error batch importing members:", error);
        alert("匯入失敗，請確認資料結構或權限。");
      }
    };
    
    if (file.name.toLowerCase().endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
    
    e.target.value = ''; // Reset input to allow re-importing identical files
  };

  const filteredMembers = members.filter(m => {
    const matchesSearch = 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.dietaryHabits?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (Array.isArray(m.tags) 
        ? m.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
        : (typeof m.tags === 'string' && (m.tags as string).toLowerCase().includes(searchTerm.toLowerCase()))
      );
    const matchesGroup = selectedGroupId === 'all' || m.groupId === selectedGroupId;
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-light mb-1">名單管理</h2>
          <p className="text-stone-500">管理目前共 {members.length} 位參與團員。</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedMemberIds.length > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
              {isDeletingAll ? (
                <div className="flex items-center gap-2 bg-red-50 p-1 rounded-full border border-red-200">
                  <button 
                    onClick={handleDeleteSelected}
                    className="bg-red-500 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-colors shadow-sm"
                  >
                    確認刪除 {selectedMemberIds.length} 位
                  </button>
                  <button 
                    onClick={() => setIsDeletingAll(false)}
                    className="p-1.5 text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsDeletingAll(true)}
                  className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-full text-sm font-bold hover:bg-red-100 transition-all shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  刪除選中 ({selectedMemberIds.length})
                </button>
              )}
            </div>
          )}
          <button 
            onClick={() => setIsManagingGroups(true)}
            className="flex items-center gap-2 bg-white border border-stone-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-stone-50 transition-colors shadow-sm"
          >
            <Users className="w-4 h-4" />
            管理組別
          </button>
          <label className="flex items-center gap-2 bg-white border border-stone-200 px-4 py-2 rounded-full text-sm font-medium cursor-pointer hover:bg-stone-50 transition-colors shadow-sm">
            <Upload className="w-4 h-4" />
            批次匯入名單
            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
          </label>
          <button 
            onClick={() => setIsAddingMember(true)}
            className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            新增團員
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row items-center gap-4 bg-white p-2 rounded-3xl border border-stone-100 shadow-sm">
        <div className="relative w-full xl:w-96 flex-shrink-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input 
            type="text" 
            placeholder="搜尋團員姓名、組別或標籤..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-transparent rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 transition-all focus:bg-white focus:border-[#00F3FF] focus:brightness-110 font-medium"
          />
        </div>
        
        <div className="flex-1 w-full flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setSelectedGroupId('all')}
            className={cn(
              "flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200",
              selectedGroupId === 'all' 
                ? "bg-stone-900 text-white border-stone-900 shadow-lg scale-105" 
                : "bg-white text-stone-400 border-stone-100 hover:border-stone-200 hover:bg-stone-50"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            所有成員 ({members.length})
          </button>
          
          <div className="w-px h-6 bg-stone-100 flex-shrink-0 mx-1" />

          {groups.map(g => {
            const count = members.filter(m => m.groupId === g.id).length;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={cn(
                  "flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200",
                  selectedGroupId === g.id 
                    ? "bg-stone-900 text-white border-stone-900 shadow-lg scale-105" 
                    : "bg-white text-stone-400 border-stone-100 hover:border-stone-200 hover:bg-stone-50"
                )}
              >
                {g.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Member List */}
      <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-4 w-10">
                  <button onClick={toggleSelectAll} className="p-1 text-stone-400 hover:text-stone-900 transition-colors">
                    {selectedMemberIds.length === filteredMembers.length && filteredMembers.length > 0 
                      ? <CheckSquare className="w-5 h-5 text-stone-900" /> 
                      : <Square className="w-5 h-5" />
                    }
                  </button>
                </th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap min-w-[120px] w-[140px]">姓名</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap">組別</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap">天數</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap">性別</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap">飲食偏好</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredMembers.map((member) => (
                <tr key={member.id} className={cn(
                  "hover:bg-stone-50 transition-colors group whitespace-nowrap",
                  selectedMemberIds.includes(member.id) && "bg-stone-50/80"
                )}>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleSelectMember(member.id)}
                      className="p-1 text-stone-400 hover:text-stone-900 transition-colors"
                    >
                      {selectedMemberIds.includes(member.id) 
                        ? <CheckSquare className="w-5 h-5 text-stone-900 shadow-sm" /> 
                        : <Square className="w-5 h-5 opacity-40 group-hover:opacity-100" />
                      }
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-600">
                        {member.name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-stone-900">{member.name}</span>
                          {member.isLeader && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[10px] font-bold">
                              <Crown className="w-2.5 h-2.5" />
                              組長
                            </span>
                          )}
                        </div>
                        {(member.outboundFlight || member.returnFlight) && (
                          <div className="text-[10px] text-stone-400 flex gap-2 font-mono tracking-tighter mt-0.5">
                            {member.outboundFlight && <span>✈️ {member.outboundFlight}</span>}
                            {member.returnFlight && <span>🏠 {member.returnFlight}</span>}
                          </div>
                        )}
                        {member.tags && (Array.isArray(member.tags) ? member.tags.length > 0 : !!member.tags) && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {Array.isArray(member.tags) ? (
                              member.tags.map((tag, idx) => (
                                <span key={idx} className="px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded text-[10px] font-medium border border-stone-200/60 shadow-sm">
                                  {tag.trim()}
                                </span>
                              ))
                            ) : (
                              <span className="px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded text-[10px] font-medium border border-stone-200/60 shadow-sm">
                                {(member.tags as string).trim()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={member.groupId || ''}
                      onChange={(e) => handleQuickGroupChange(member.id, e.target.value)}
                      className="bg-transparent text-sm font-medium text-stone-600 focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 rounded-lg px-2 py-1.5 -ml-2 hover:bg-stone-100 transition-all duration-200 ease-out cursor-pointer active:border-[#00F3FF] active:brightness-110"
                    >
                      <option value="">未分組</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-black border whitespace-nowrap",
                      getMemberTripDayColor(member.tripDays)
                    )}>
                      {member.tripDays ? `${member.tripDays} 天` : '未標註'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-full font-medium",
                      member.gender === '男' || member.gender === 'M' ? "bg-stone-50 text-stone-600 border border-stone-200" : 
                      member.gender === '女' || member.gender === 'F' ? "bg-stone-50 text-stone-600 border border-stone-200" : 
                      "bg-stone-50/50 text-stone-400 border border-stone-100/50"
                    )}>
                      {member.gender === '男' || member.gender === 'M' ? '男' : 
                       member.gender === '女' || member.gender === 'F' ? '女' : '未設定'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-full font-medium",
                      member.dietaryHabits?.includes('素') ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-600"
                    )}>
                      {member.dietaryHabits || '一般 (葷)'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                      {deletingId === member.id ? (
                        <div className="flex items-center justify-end gap-1 bg-red-50 p-1 rounded-lg border border-red-100">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteMember(member.id); }} 
                            className="px-2 py-1 bg-red-500 text-white text-[10px] font-black rounded-md shadow-sm hover:bg-red-600 transition-colors"
                          >
                            確認
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeletingId(null); }} 
                            className="p-1 text-stone-400 hover:text-stone-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => setViewingItineraryMember(member)}
                            className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors flex items-center gap-1.5"
                            title="查看個人行程"
                          >
                            <Calendar className="w-4 h-4" />
                            <span className="text-[10px] font-bold">個人行程</span>
                          </button>
                          <button 
                            onClick={() => setEditingMember(member)}
                            className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                            title="編輯成員"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeletingId(member.id)}
                            className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="刪除成員"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-stone-400">
                    找不到符合搜尋條件的團員。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(isAddingMember || editingMember) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-serif">
                {isAddingMember ? '新增成員' : '編輯成員'}
              </h3>
              <button 
                onClick={() => { setIsAddingMember(false); setEditingMember(null); }}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={isAddingMember ? handleAddMember : handleUpdateMember} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">姓名 (Full Name)</label>
                  <input 
                    type="text" 
                    required
                    autoFocus
                    value={isAddingMember ? newMember.name : editingMember?.name}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, name: e.target.value}) : setEditingMember({...editingMember!, name: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">行程天數 (Trip Days)</label>
                  <input 
                    type="number" 
                    placeholder="例如: 9"
                    value={isAddingMember ? newMember.tripDays || '' : editingMember?.tripDays || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                      isAddingMember ? setNewMember({...newMember, tripDays: val}) : setEditingMember({...editingMember!, tripDays: val});
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">性別 (Gender)</label>
                  <select 
                    value={isAddingMember ? newMember.gender : editingMember?.gender}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, gender: e.target.value}) : setEditingMember({...editingMember!, gender: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  >
                    <option value="">未設定</option>
                    <option value="男">男 (Male)</option>
                    <option value="女">女 (Female)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  {(() => {
                    const currentGroupId = isAddingMember ? newMember.groupId : editingMember?.groupId;
                    const existingLeader = members.find(m => m.groupId === currentGroupId && m.isLeader && m.id !== (editingMember?.id || ''));
                    const isAlreadyLeader = isAddingMember ? newMember.isLeader : editingMember?.isLeader;

                    return (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-end gap-6">
                          <div className="flex-1">
                            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1 flex justify-between items-center">
                              <span>所屬組別 (Group)</span>
                              {!isAddingMember && editingMember?.isLeader && (
                                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">組長不可更改小組</span>
                              )}
                            </label>
                            <select 
                              disabled={!isAddingMember && editingMember?.isLeader}
                              value={isAddingMember ? newMember.groupId : editingMember?.groupId}
                              onChange={(e) => isAddingMember ? setNewMember({...newMember, groupId: e.target.value}) : setEditingMember({...editingMember!, groupId: e.target.value})}
                              className={cn(
                                "w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5",
                                !isAddingMember && editingMember?.isLeader && "opacity-60 cursor-not-allowed bg-stone-100"
                              )}
                            >
                              <option value="">尚未分組</option>
                              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </div>
                          <div className="pb-3">
                            <label className={cn(
                              "flex items-center gap-2 cursor-pointer group/leader transition-all",
                              existingLeader && !isAlreadyLeader && "cursor-not-allowed opacity-50"
                            )}>
                              <div 
                                onClick={() => {
                                  if (existingLeader && !isAlreadyLeader) return;
                                  if (isAddingMember) setNewMember({...newMember, isLeader: !newMember.isLeader});
                                  else setEditingMember({...editingMember!, isLeader: !editingMember!.isLeader});
                                }}
                                className={cn(
                                  "w-6 h-6 rounded-lg border transition-all flex items-center justify-center shadow-sm",
                                  isAlreadyLeader
                                    ? "bg-amber-500 border-amber-500 text-white shadow-amber-200"
                                    : "bg-white border-stone-200 group-hover/leader:border-amber-400"
                                )}
                              >
                                {isAlreadyLeader && <Check className="w-4 h-4" strokeWidth={3} />}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-stone-900 leading-none">設為小組長</span>
                                <span className="text-[9px] text-stone-400 font-bold uppercase tracking-tighter mt-1">Set as Leader</span>
                              </div>
                            </label>
                          </div>
                        </div>
                        {existingLeader && !isAlreadyLeader && (
                          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
                            <span className="text-[10px] text-amber-600 font-bold">⚠️ 此小組已有組長 ({existingLeader.name})，不可重複設定。</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">飲食偏好 (Dietary)</label>
                  <select 
                    value={isAddingMember ? newMember.dietaryHabits : editingMember?.dietaryHabits}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, dietaryHabits: e.target.value}) : setEditingMember({...editingMember!, dietaryHabits: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50"
                  >
                    <option value="">一般 (葷食)</option>
                    <option value="素食 (Vegetarian)">素食 (Vegetarian)</option>
                    <option value="全素 (Vegan)">全素 (Vegan)</option>
                    <option value="不吃牛 (No Beef)">不吃牛 (No Beef)</option>
                    <option value="不吃豬 (No Pork)">不吃豬 (No Pork)</option>
                    <option value="海鮮素 (Pescatarian)">海鮮素 (Pescatarian)</option>
                    <option value="清真 (Halal)">清真 (Halal)</option>
                    <option value="其他 (Other)">其他 (Other)</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">護照號碼 (Passport)</label>
                  <input 
                    type="text" 
                    value={isAddingMember ? newMember.passportInfo : editingMember?.passportInfo}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, passportInfo: e.target.value}) : setEditingMember({...editingMember!, passportInfo: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">標籤/備註 (Tags) - 用逗號分隔</label>
                  <input 
                    type="text" 
                    placeholder="例如: 工作人員, VIP, 第一梯次"
                    value={isAddingMember ? (newMember.tags || []).join(', ') : (editingMember?.tags || []).join(', ')}
                    onChange={(e) => {
                      const value = e.target.value;
                      const tagsArray = value.split(',').map(t => t.trim()).filter(Boolean);
                      
                      // Process only if a comma was just added or it's a bulk paste
                      const { tags: processedTags, tripDays: processedDays } = processTagsForTripDays(
                        tagsArray, 
                        isAddingMember ? newMember.tripDays : editingMember?.tripDays
                      );

                      if (isAddingMember) {
                        setNewMember({
                          ...newMember, 
                          tags: processedTags,
                          tripDays: processedDays
                        });
                      } else {
                        setEditingMember({
                          ...editingMember!, 
                          tags: processedTags,
                          tripDays: processedDays
                        });
                      }
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
                  />
                </div>
                
                <div className="col-span-2 space-y-2">
                  <button 
                    type="button"
                    onClick={() => setIsFlightExpanded(!isFlightExpanded)}
                    className={cn(
                      "w-full flex items-center justify-between p-4 bg-stone-50 border transition-all duration-200 ease-out font-bold text-stone-900 group rounded-2xl",
                      isFlightExpanded 
                        ? "border-[#00F3FF] ring-2 ring-[#00F3FF]/10 brightness-110" 
                        : "border-stone-200 hover:scale-[1.02] hover:shadow-[0_5px_15px_-5px_rgba(0,0,0,0.1)] active:brightness-110 active:border-[#00F3FF]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        isFlightExpanded ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-600 group-hover:bg-stone-900 group-hover:text-white"
                      )}>
                        <Plane className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-sm">航班資訊 (Flight Info)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-stone-400 bg-white border border-stone-200 px-2 py-0.5 rounded-full">
                        {isFlightExpanded ? '點擊收合' : '點擊展開'}
                      </span>
                      <MoreVertical className={cn("w-4 h-4 text-stone-400 transition-transform", isFlightExpanded && "rotate-90")} />
                    </div>
                  </button>

                  {isFlightExpanded && (
                    <div className="p-5 border border-stone-200 rounded-2xl bg-white space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">去程航班 (Outbound)</label>
                          <input 
                            type="text" 
                            placeholder="e.g. BR192"
                            value={isAddingMember ? newMember.outboundFlight : editingMember?.outboundFlight}
                            onChange={(e) => isAddingMember ? setNewMember({...newMember, outboundFlight: e.target.value}) : setEditingMember({...editingMember!, outboundFlight: e.target.value})}
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">去程時間 (Time)</label>
                          <input 
                            type="text" 
                            placeholder="例如: 05/01 07:30"
                            value={isAddingMember ? newMember.outboundTime : editingMember?.outboundTime}
                            onChange={(e) => isAddingMember ? setNewMember({...newMember, outboundTime: e.target.value}) : setEditingMember({...editingMember!, outboundTime: e.target.value})}
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">回程航班 (Return)</label>
                          <input 
                            type="text" 
                            placeholder="e.g. BR191"
                            value={isAddingMember ? newMember.returnFlight : editingMember?.returnFlight}
                            onChange={(e) => isAddingMember ? setNewMember({...newMember, returnFlight: e.target.value}) : setEditingMember({...editingMember!, returnFlight: e.target.value})}
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">回程時間 (Time)</label>
                          <input 
                            type="text" 
                            placeholder="例如: 05/05 14:20"
                            value={isAddingMember ? newMember.returnTime : editingMember?.returnTime}
                            onChange={(e) => isAddingMember ? setNewMember({...newMember, returnTime: e.target.value}) : setEditingMember({...editingMember!, returnTime: e.target.value})}
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => { setIsAddingMember(false); setEditingMember(null); }}
                  className="flex-1 py-3 border border-stone-200 rounded-xl font-medium hover:bg-stone-50 transition-colors"
                >
                  取消 (Cancel)
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
                >
                  {isAddingMember ? '新增 (Add)' : '儲存變更 (Save)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Groups Modal */}
      {isManagingGroups && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-serif">管理組別 (Manage Groups)</h3>
              <button onClick={() => setIsManagingGroups(false)} className="text-stone-400 hover:text-stone-900">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddGroup} className="flex gap-2 mb-6">
              <input 
                type="text" 
                placeholder="輸入新組別名稱..."  
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="flex-1 px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
              />
              <button 
                type="submit"
                className="bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors"
              >
                新增
              </button>
            </form>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {groups.map(group => (
                <div key={group.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100">
                  {editingGroup?.id === group.id ? (
                    <form onSubmit={handleUpdateGroup} className="flex-1 flex gap-2">
                      <input 
                        type="text" 
                        value={editingGroup.name}
                        onChange={(e) => setEditingGroup({...editingGroup, name: e.target.value})}
                        className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm"
                        autoFocus
                      />
                      <button type="submit" className="text-green-600 hover:text-green-700">
                        <Check className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setEditingGroup(null)} className="text-stone-400 hover:text-stone-600">
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-stone-900">{group.name}</span>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => setEditingGroup(group)}
                          className="p-1.5 text-stone-400 hover:text-stone-900 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteGroup(group.id)}
                          className="p-1.5 text-stone-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {groups.length === 0 && (
                <p className="text-center py-4 text-stone-400 text-sm">目前尚未建立任何組別。</p>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingItineraryMember && (
        <PersonalItineraryModal 
          member={viewingItineraryMember}
          itineraries={itineraries}
          tripSettings={tripSettings}
          onClose={() => setViewingItineraryMember(null)}
        />
      )}
    </div>
  );
}
