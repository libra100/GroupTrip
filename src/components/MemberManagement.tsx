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
  Users
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
    phone: '',
    passportInfo: '',
    groupId: '',
    tags: []
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
      setNewMember({ name: '', dietaryHabits: '', phone: '', passportInfo: '', groupId: '', tags: [] });
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
    if (!confirm("Are you sure you want to delete this member?")) return;
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
    if (!confirm("Delete this group? Members in this group will be unassigned.")) return;
    try {
      await deleteDoc(doc(db, 'groups', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${id}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const batch = writeBatch(db);
      data.forEach((row) => {
        const newDocRef = doc(collection(db, 'members'));
        batch.set(newDocRef, {
          id: newDocRef.id,
          name: row.Name || row.姓名 || '',
          dietaryHabits: row.Dietary || row.飲食 || '',
          phone: row.Phone || row.電話 || '',
          passportInfo: row.Passport || row.護照 || '',
          groupId: row.Group || row.組別 || '',
          tags: row.Tags ? row.Tags.split(',') : []
        });
      });

      try {
        await batch.commit();
        alert(`Successfully imported ${data.length} members!`);
      } catch (error) {
        console.error("Error batch importing members:", error);
      }
    };
    reader.readAsBinaryString(file);
  };

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         m.phone?.includes(searchTerm) ||
                         m.dietaryHabits?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = selectedGroupId === 'all' || m.groupId === selectedGroupId;
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-light mb-1">Member Management</h2>
          <p className="text-stone-500">Manage your group of {members.length} participants.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsManagingGroups(true)}
            className="flex items-center gap-2 bg-white border border-stone-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-stone-50 transition-colors shadow-sm"
          >
            <Users className="w-4 h-4" />
            Manage Groups
          </button>
          <label className="flex items-center gap-2 bg-white border border-stone-200 px-4 py-2 rounded-full text-sm font-medium cursor-pointer hover:bg-stone-50 transition-colors shadow-sm">
            <Upload className="w-4 h-4" />
            Import Excel/CSV
            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
          </label>
          <button 
            onClick={() => setIsAddingMember(true)}
            className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add Member
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input 
            type="text" 
            placeholder="Search by name, phone, or diet..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 transition-all shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2 bg-white border border-stone-200 px-4 py-2 rounded-2xl shadow-sm">
          <Filter className="w-4 h-4 text-stone-400" />
          <select 
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="bg-transparent focus:outline-none text-sm font-medium"
          >
            <option value="all">All Groups</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Member List */}
      <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500">Name</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500">Group</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500">Dietary</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500">Phone</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 text-right">Actions</th>
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
                      <span className="font-medium text-stone-900">{member.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-stone-600">
                      {groups.find(g => g.id === member.groupId)?.name || 'No Group'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-xs px-2 py-1 rounded-full font-medium",
                      member.dietaryHabits?.includes('素') ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-600"
                    )}>
                      {member.dietaryHabits || 'Standard'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-500">{member.phone || '-'}</td>
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
                  <td colSpan={5} className="px-6 py-12 text-center text-stone-400">
                    No members found matching your search.
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
              {isAddingMember ? 'Add New Member' : 'Edit Member'}
            </h3>
            <form onSubmit={isAddingMember ? handleAddMember : handleUpdateMember} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Full Name</label>
                  <input 
                    type="text" 
                    required
                    value={isAddingMember ? newMember.name : editingMember?.name}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, name: e.target.value}) : setEditingMember({...editingMember!, name: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Phone Number</label>
                  <input 
                    type="text" 
                    value={isAddingMember ? newMember.phone : editingMember?.phone}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, phone: e.target.value}) : setEditingMember({...editingMember!, phone: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Group</label>
                  <select 
                    value={isAddingMember ? newMember.groupId : editingMember?.groupId}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, groupId: e.target.value}) : setEditingMember({...editingMember!, groupId: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  >
                    <option value="">No Group</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Dietary Habits</label>
                  <select 
                    value={isAddingMember ? newMember.dietaryHabits : editingMember?.dietaryHabits}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, dietaryHabits: e.target.value}) : setEditingMember({...editingMember!, dietaryHabits: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  >
                    <option value="">Standard (葷食)</option>
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Passport Info</label>
                  <input 
                    type="text" 
                    value={isAddingMember ? newMember.passportInfo : editingMember?.passportInfo}
                    onChange={(e) => isAddingMember ? setNewMember({...newMember, passportInfo: e.target.value}) : setEditingMember({...editingMember!, passportInfo: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => { setIsAddingMember(false); setEditingMember(null); }}
                  className="flex-1 py-3 border border-stone-200 rounded-xl font-medium hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
                >
                  {isAddingMember ? 'Add Member' : 'Save Changes'}
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
              <h3 className="text-2xl font-serif">Manage Groups</h3>
              <button onClick={() => setIsManagingGroups(false)} className="text-stone-400 hover:text-stone-900">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddGroup} className="flex gap-2 mb-6">
              <input 
                type="text" 
                placeholder="New group name..." 
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="flex-1 px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
              />
              <button 
                type="submit"
                className="bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors"
              >
                Add
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
                <p className="text-center py-4 text-stone-400 text-sm">No groups created yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
