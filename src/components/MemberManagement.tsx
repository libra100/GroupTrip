import React, { useState } from 'react';
import { Member, Group } from '../types';
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
  Crown
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
import { cn } from '../lib/utils';

interface MemberManagementProps {
  members: Member[];
  groups: Group[];
}

export default function MemberManagement({ members, groups }: MemberManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isManagingGroups, setIsManagingGroups] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');

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
    isLeader: false
  });

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.name) return;

    try {
      const docRef = await addDoc(collection(db, 'members'), {
        ...newMember,
        id: Date.now().toString(), // Temporary ID, Firestore will generate its own
      });
      await updateDoc(docRef, { id: docRef.id });
      setIsAddingMember(false);
      setNewMember({ name: '', dietaryHabits: '', passportInfo: '', groupId: '', tags: [], outboundFlight: '', outboundTime: '', returnFlight: '', returnTime: '', isLeader: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'members');
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !editingMember.name) return;

    try {
      const memberRef = doc(db, 'members', editingMember.id);
      await updateDoc(memberRef, { ...editingMember });
      setEditingMember(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `members/${editingMember.id}`);
    }
  };

  const handleDeleteMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'members', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `members/${id}`);
    }
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

        const newDocRef = doc(collection(db, 'members'));
        batch.set(newDocRef, {
          id: newDocRef.id,
          name: name,
          dietaryHabits: dietary,
          passportInfo: passport,
          groupId: group,
          tags: typeof tags === 'string' && tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          outboundFlight,
          outboundTime,
          returnFlight,
          returnTime,
          isLeader: row['IsLeader'] === 'true' || row['組長'] === '是' || false
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
          <button 
            onClick={async () => {
              try {
                const emptyMembers = members.filter(m => !m.name || m.name.trim() === '');
                if (emptyMembers.length === 0) {
                  alert("目前沒有需要清除的空白名單！");
                  return;
                }
                const batch = writeBatch(db);
                emptyMembers.forEach(m => {
                  if (m.id) batch.delete(doc(db, 'members', m.id));
                });
                await batch.commit();
                alert(`成功清除了 ${emptyMembers.length} 筆空白資料！`);
              } catch(e) {
                console.error(e);
                alert("刪除失敗，請確認資料庫權限或網路連線。");
              }
            }}
            className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-red-100 transition-colors shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            清除空白
          </button>
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

      {/* Filters & Analytics */}
      <div className="flex flex-col gap-6">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input 
            type="text" 
            placeholder="搜尋姓名、飲食或標籤..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 transition-all shadow-sm focus:border-[#00F3FF] focus:brightness-110"
          />
        </div>
        
        {/* Group Summary Chips */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setSelectedGroupId('all')}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-2xl border text-sm font-medium transition-all duration-200 ease-out",
              selectedGroupId === 'all' 
                ? "bg-stone-900 text-white border-stone-900 shadow-[0_0_5px_rgba(0,243,255,0.3)] brightness-110" 
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50 hover:scale-[1.02] hover:shadow-[0_0_5px_rgba(0,0,0,0.1)] active:border-[#00F3FF]"
            )}
          >
            <Users className="w-4 h-4" />
            所有成員
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs",
              selectedGroupId === 'all' ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
            )}>
              {members.length}
            </span>
          </button>
          
          {groups.map(g => {
            const count = members.filter(m => m.groupId === g.id).length;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-2xl border text-sm font-medium transition-all duration-200 ease-out",
                  selectedGroupId === g.id 
                    ? "bg-stone-900 text-white border-stone-900 shadow-[0_0_5px_rgba(0,243,255,0.3)] brightness-110" 
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50 hover:scale-[1.02] hover:shadow-[0_0_5px_rgba(0,0,0,0.1)] active:border-[#00F3FF]"
                )}
              >
                {g.name}
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-xs",
                  selectedGroupId === g.id ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
                )}>
                  {count}
                </span>
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
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500">姓名</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500">組別</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500">飲食偏好</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-stone-50 transition-colors group">
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
                      "text-xs px-2 py-1 rounded-full font-medium",
                      member.dietaryHabits?.includes('素') ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-600"
                    )}>
                      {member.dietaryHabits || '一般 (葷)'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setEditingMember(member)}
                        className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteMember(member.id)}
                        className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-stone-400">
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
            <h3 className="text-2xl font-serif mb-6">
              {isAddingMember ? '新增成員' : '編輯成員'}
            </h3>
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
                <div className="col-span-2">
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
                <div className="col-span-2">
                  {(() => {
                    const currentGroupId = isAddingMember ? newMember.groupId : editingMember?.groupId;
                    const existingLeader = members.find(m => m.groupId === currentGroupId && m.isLeader && m.id !== (editingMember?.id || ''));
                    const isAlreadyLeader = isAddingMember ? newMember.isLeader : editingMember?.isLeader;

                    return (
                      <div className="flex flex-col gap-1">
                        <label className={cn(
                          "flex items-center gap-2 cursor-pointer group/leader",
                          existingLeader && !isAlreadyLeader && "cursor-not-allowed opacity-50"
                        )}>
                          <div 
                            onClick={() => {
                              if (existingLeader && !isAlreadyLeader) return;
                              if (isAddingMember) setNewMember({...newMember, isLeader: !newMember.isLeader});
                              else setEditingMember({...editingMember!, isLeader: !editingMember!.isLeader});
                            }}
                            className={cn(
                              "w-5 h-5 rounded border transition-all flex items-center justify-center",
                              isAlreadyLeader
                                ? "bg-amber-500 border-amber-500 text-white"
                                : "bg-white border-stone-200 group-hover/leader:border-amber-400"
                            )}
                          >
                            {isAlreadyLeader && <Check className="w-3.5 h-3.5" />}
                          </div>
                          <span className="text-sm font-medium text-stone-600">設為此小組之組長</span>
                        </label>
                        {existingLeader && !isAlreadyLeader && (
                          <p className="text-[10px] text-amber-600 font-medium ml-7">
                            ⚠️ 此小組已有組長 ({existingLeader.name})，不可重複設定。
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">飲食偏好 (Dietary Habits)</label>
                  <select 
                    value={isAddingMember ? newMember.dietaryHabits : editingMember?.dietaryHabits}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, dietaryHabits: e.target.value}) : setEditingMember({...editingMember!, dietaryHabits: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
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
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">護照號碼 (Passport Info)</label>
                  <input 
                    type="text" 
                    value={isAddingMember ? newMember.passportInfo : editingMember?.passportInfo}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, passportInfo: e.target.value}) : setEditingMember({...editingMember!, passportInfo: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">標籤/備註 (Tags) - 用逗號分隔</label>
                  <input 
                    type="text" 
                    placeholder="例如: 工作人員, VIP, 第一梯次"
                    value={isAddingMember ? (newMember.tags || []).join(', ') : (editingMember?.tags || []).join(', ')}
                    onChange={(e) => {
                      const tagsArray = e.target.value.split(',').map(t => t.trim()).filter(t => t !== '');
                      if (isAddingMember) {
                        setNewMember({...newMember, tags: tagsArray});
                      } else {
                        setEditingMember({...editingMember!, tags: tagsArray});
                      }
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
                  />
                </div>
                
                <div className="col-span-2 pt-4 mt-2 border-t border-stone-100">
                  <h4 className="text-sm font-bold text-stone-900 mb-4 flex items-center gap-2">航班資訊 (Flight Info) <span className="text-xs font-normal text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">選填</span></h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">去程航班號碼 (Outbound)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. BR192"
                        value={isAddingMember ? newMember.outboundFlight : editingMember?.outboundFlight}
                        onChange={(e) => isAddingMember ? setNewMember({...newMember, outboundFlight: e.target.value}) : setEditingMember({...editingMember!, outboundFlight: e.target.value})}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">去程時間 (Outbound Time)</label>
                      <input 
                        type="text" 
                        placeholder="例如: 2026/05/01 07:30"
                        value={isAddingMember ? newMember.outboundTime : editingMember?.outboundTime}
                        onChange={(e) => isAddingMember ? setNewMember({...newMember, outboundTime: e.target.value}) : setEditingMember({...editingMember!, outboundTime: e.target.value})}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">回程航班號碼 (Return)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. BR191"
                        value={isAddingMember ? newMember.returnFlight : editingMember?.returnFlight}
                        onChange={(e) => isAddingMember ? setNewMember({...newMember, returnFlight: e.target.value}) : setEditingMember({...editingMember!, returnFlight: e.target.value})}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">回程時間 (Return Time)</label>
                      <input 
                        type="text" 
                        placeholder="例如: 2026/05/05 14:20"
                        value={isAddingMember ? newMember.returnTime : editingMember?.returnTime}
                        onChange={(e) => isAddingMember ? setNewMember({...newMember, returnTime: e.target.value}) : setEditingMember({...editingMember!, returnTime: e.target.value})}
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
                      />
                    </div>
                  </div>
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
    </div>
  );
}
