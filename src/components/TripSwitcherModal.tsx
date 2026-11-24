import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { format, addDays } from 'date-fns';
import {
  X,
  Plus,
  KeyRound,
  Share2,
  FolderKanban,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Edit2,
  LogOut,
  Users,
  Calendar,
  Mail,
  Link2,
  Sparkles,
  Crown
} from 'lucide-react';
import { Trip } from '../types';
import { db, tripDoc } from '../firebase';
import { cn } from '../lib/utils';
import {
  ParsedTripProposal,
  commitParsedItinerariesToTrip,
  commitParsedMembersToTrip
} from '../lib/aiTripParser';
import AiProposalParserPanel from './AiProposalParserPanel';

export type TripModalTab = 'list' | 'create' | 'join' | 'share';

interface TripSwitcherModalProps {
  isOpen: boolean;
  initialTab?: TripModalTab;
  onClose: () => void;
  trips: Trip[];
  activeTrip: Trip | null;
  onSelectTrip: (tripId: string) => void;
  currentUser: User;
}

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 6): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += INVITE_CHARS.charAt(Math.floor(Math.random() * INVITE_CHARS.length));
  }
  return result;
}

export default function TripSwitcherModal({
  isOpen,
  initialTab = 'list',
  onClose,
  trips,
  activeTrip,
  onSelectTrip,
  currentUser
}: TripSwitcherModalProps) {
  const [activeTab, setActiveTab] = useState<TripModalTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Create tab state
  const [createMode, setCreateMode] = useState<'ai' | 'manual'>('ai');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStartDate, setNewStartDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [newEndDate, setNewEndDate] = useState(() => format(addDays(new Date(), 4), 'yyyy-MM-dd'));

  // Inline edit state for list tab
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Join tab state
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // Share tab state
  const [collabEmailInput, setCollabEmailInput] = useState('');
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMsg(null);
      setStatusMsg(null);
      setEditingTripId(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const userEmailLower = (currentUser.email || '').trim().toLowerCase();

  const handleCopy = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      setErrorMsg('無法複製至剪貼簿，請手動選取複製。');
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setErrorMsg('請輸入行程名稱。');
      return;
    }
    if (!newStartDate || !newEndDate || newStartDate > newEndDate) {
      setErrorMsg('結束日期不能早於開始日期。');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const newTripRef = doc(collection(db, 'trips'));
      const nowIso = new Date().toISOString();
      const newTripPayload: Trip = {
        id: newTripRef.id,
        name: trimmedName,
        description: newDesc.trim(),
        startDate: newStartDate,
        endDate: newEndDate,
        ownerId: currentUser.uid,
        ownerEmail: userEmailLower || 'unknown@example.com',
        ownerName: currentUser.displayName || userEmailLower || '建立者',
        memberUids: [currentUser.uid],
        collaboratorEmails: userEmailLower ? [userEmailLower] : [],
        inviteCode: generateInviteCode(),
        createdAt: nowIso,
        updatedAt: nowIso
      };

      // Write parent trip document first so subcollection security rules can evaluate ownership
      await setDoc(newTripRef, newTripPayload);
      await setDoc(tripDoc('settings', 'tripSettings', newTripRef.id), {
        startDate: newStartDate,
        endDate: newEndDate,
        officialStartDate: newStartDate,
        dailyAbsences: {}
      });

      setNewName('');
      setNewDesc('');
      onSelectTrip(newTripRef.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '建立行程失敗，請稍後再試。');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTripFromAI = async (proposal: ParsedTripProposal) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const newTripRef = doc(collection(db, 'trips'));
      const nowIso = new Date().toISOString();
      const newTripPayload: Trip = {
        id: newTripRef.id,
        name: proposal.name.trim(),
        description: proposal.description.trim(),
        startDate: proposal.startDate,
        endDate: proposal.endDate,
        ownerId: currentUser.uid,
        ownerEmail: userEmailLower || 'unknown@example.com',
        ownerName: currentUser.displayName || userEmailLower || '建立者',
        memberUids: [currentUser.uid],
        collaboratorEmails: userEmailLower ? [userEmailLower] : [],
        inviteCode: generateInviteCode(),
        createdAt: nowIso,
        updatedAt: nowIso
      };

      // Write parent trip document first so subcollection security rules allow writing child docs
      const officialStart = proposal.officialStartDate || proposal.startDate;
      await setDoc(newTripRef, newTripPayload);
      await setDoc(tripDoc('settings', 'tripSettings', newTripRef.id), {
        startDate: proposal.startDate,
        endDate: proposal.endDate,
        officialStartDate: officialStart,
        dailyAbsences: {}
      });

      await commitParsedItinerariesToTrip(
        newTripRef.id,
        officialStart,
        proposal.items
      );

      await commitParsedMembersToTrip(
        newTripRef.id,
        proposal.members || []
      );

      onSelectTrip(newTripRef.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '建立 AI 辨識行程失敗，請稍後再試。');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleStartEdit = (trip: Trip) => {
    setEditingTripId(trip.id);
    setEditName(trip.name);
    setEditDesc(trip.description || '');
    setEditStartDate(trip.startDate);
    setEditEndDate(trip.endDate);
    setErrorMsg(null);
  };

  const handleSaveEdit = async (trip: Trip) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setErrorMsg('行程名稱不可為空白。');
      return;
    }
    if (!editStartDate || !editEndDate || editStartDate > editEndDate) {
      setErrorMsg('結束日期不能早於開始日期。');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await updateDoc(doc(db, 'trips', trip.id), {
        name: trimmed,
        description: editDesc.trim(),
        startDate: editStartDate,
        endDate: editEndDate,
        updatedAt: new Date().toISOString()
      });
      await setDoc(tripDoc('settings', 'tripSettings', trip.id), {
        startDate: editStartDate,
        endDate: editEndDate,
        officialStartDate: editStartDate
      }, { merge: true });
      setEditingTripId(null);
      setStatusMsg('已更新行程資訊');
    } catch (err: any) {
      setErrorMsg(err?.message || '更新行程失敗。');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTrip = async (trip: Trip) => {
    if (confirmDeleteId !== trip.id) {
      setConfirmDeleteId(trip.id);
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await deleteDoc(doc(db, 'trips', trip.id));
      setConfirmDeleteId(null);
      setStatusMsg(`已刪除「${trip.name}」`);
    } catch (err: any) {
      setErrorMsg(err?.message || '刪除行程失敗（僅建立者可刪除）。');
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveTrip = async (trip: Trip) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const updates: Record<string, any> = {
        memberUids: arrayRemove(currentUser.uid),
        updatedAt: new Date().toISOString()
      };
      if (userEmailLower) {
        updates.collaboratorEmails = arrayRemove(userEmailLower);
      }
      await updateDoc(doc(db, 'trips', trip.id), updates);
      setStatusMsg(`已離開「${trip.name}」共編`);
    } catch (err: any) {
      setErrorMsg(err?.message || '離開共編失敗。');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      setErrorMsg('請輸入邀請碼。');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const q = query(collection(db, 'trips'), where('inviteCode', '==', code));
      const snap = await getDocs(q);
      if (snap.empty) {
        setErrorMsg('找不到符合此邀請碼的行程，請確認大小寫或聯繫分享者。');
        return;
      }

      const targetDoc = snap.docs[0];
      const updates: Record<string, any> = {
        memberUids: arrayUnion(currentUser.uid),
        updatedAt: new Date().toISOString()
      };
      if (userEmailLower) {
        updates.collaboratorEmails = arrayUnion(userEmailLower);
      }
      await updateDoc(doc(db, 'trips', targetDoc.id), updates);
      setJoinCodeInput('');
      onSelectTrip(targetDoc.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '加入行程失敗，請確認網路與登入狀態。');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateInviteCode = async () => {
    if (!activeTrip) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const nextCode = generateInviteCode();
      await updateDoc(doc(db, 'trips', activeTrip.id), {
        inviteCode: nextCode,
        updatedAt: new Date().toISOString()
      });
      setStatusMsg(`已更新邀請碼為 ${nextCode}`);
    } catch (err: any) {
      setErrorMsg(err?.message || '重新產生邀請碼失敗。');
    } finally {
      setBusy(false);
    }
  };

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    const email = collabEmailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setErrorMsg('請輸入有效的 Google Email 地址。');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await updateDoc(doc(db, 'trips', activeTrip.id), {
        collaboratorEmails: arrayUnion(email),
        updatedAt: new Date().toISOString()
      });
      setCollabEmailInput('');
      setStatusMsg(`已授權 ${email} 共同管理此行程`);
    } catch (err: any) {
      setErrorMsg(err?.message || '新增協作者失敗。');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveCollaborator = async (email: string) => {
    if (!activeTrip) return;
    if (email.toLowerCase() === activeTrip.ownerEmail.toLowerCase()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await updateDoc(doc(db, 'trips', activeTrip.id), {
        collaboratorEmails: arrayRemove(email),
        updatedAt: new Date().toISOString()
      });
      setStatusMsg(`已移除協作者 ${email}`);
    } catch (err: any) {
      setErrorMsg(err?.message || '移除協作者失敗。');
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: TripModalTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'list', label: '我的行程', icon: FolderKanban },
    { id: 'create', label: '建立新行程', icon: Plus },
    { id: 'join', label: '邀請碼加入', icon: KeyRound },
    { id: 'share', label: '共用與協作者', icon: Share2 }
  ];

  const shareUrl = activeTrip
    ? `${window.location.origin}${window.location.pathname}?join=${activeTrip.inviteCode}`
    : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-stone-900/45 backdrop-blur-sm"
    >
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-stone-200 flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between gap-4 bg-stone-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-stone-900 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-[#00F3FF]" />
            </div>
            <div>
              <h3 className="text-xl font-serif font-bold text-stone-900">多行程空間與共用中心</h3>
              <p className="text-xs text-stone-500">每個行程皆擁有完全獨立的團員名單、航班、行程表與點名紀錄</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-stone-200/70 rounded-full transition-colors text-stone-500 hover:text-stone-900"
            aria-label="關閉視窗"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 pb-0 border-b border-stone-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-white">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setErrorMsg(null);
                  setStatusMsg(null);
                }}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all whitespace-nowrap cursor-pointer',
                  isActive
                    ? 'border-[#00F3FF] text-stone-900 bg-stone-50'
                    : 'border-transparent text-stone-500 hover:text-stone-900 hover:bg-stone-50/50'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive && 'text-stone-900')} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Alerts */}
        {(errorMsg || statusMsg) && (
          <div className="px-6 pt-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                {errorMsg}
              </div>
            )}
            {statusMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                {statusMsg}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: LIST */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {trips.length === 0 ? (
                <div className="text-center py-12 bg-stone-50 rounded-2xl border border-dashed border-stone-200 space-y-3">
                  <FolderKanban className="w-10 h-10 mx-auto text-stone-300" />
                  <p className="text-sm font-bold text-stone-600">尚未加入或建立任何旅遊行程</p>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('create')}
                      className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800"
                    >
                      建立第一個行程
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('join')}
                      className="px-4 py-2 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-bold hover:bg-stone-50"
                    >
                      輸入邀請碼加入
                    </button>
                  </div>
                </div>
              ) : (
                trips.map((trip) => {
                  const isCurrent = activeTrip?.id === trip.id;
                  const isOwner = trip.ownerId === currentUser.uid;
                  const isEditing = editingTripId === trip.id;

                  return (
                    <div
                      key={trip.id}
                      className={cn(
                        'rounded-2xl border p-4 sm:p-5 transition-all',
                        isCurrent
                          ? 'border-[#00F3FF] bg-[#00F3FF]/5 shadow-sm'
                          : 'border-stone-200 bg-white hover:border-stone-300'
                      )}
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-stone-500">行程名稱</label>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full mt-1 px-3 py-2 rounded-xl border border-stone-200 text-sm font-bold"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-stone-500">簡介</label>
                              <input
                                type="text"
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                className="w-full mt-1 px-3 py-2 rounded-xl border border-stone-200 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-stone-500">開始日期</label>
                              <input
                                type="date"
                                value={editStartDate}
                                onChange={(e) => setEditStartDate(e.target.value)}
                                className="w-full mt-1 px-3 py-2 rounded-xl border border-stone-200 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-stone-500">結束日期</label>
                              <input
                                type="date"
                                value={editEndDate}
                                onChange={(e) => setEditEndDate(e.target.value)}
                                className="w-full mt-1 px-3 py-2 rounded-xl border border-stone-200 text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingTripId(null)}
                              className="px-3 py-1.5 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleSaveEdit(trip)}
                              className="px-4 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 disabled:opacity-50"
                            >
                              儲存變更
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => {
                              onSelectTrip(trip.id);
                              onClose();
                            }}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-serif font-bold text-lg text-stone-900 truncate">
                                {trip.name}
                              </h4>
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-full bg-stone-900 text-[#00F3FF] text-[10px] font-black uppercase tracking-wider">
                                  目前使用中
                                </span>
                              )}
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-bold',
                                  isOwner
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-sky-100 text-sky-800'
                                )}
                              >
                                {isOwner ? '建立者' : '共編成員'}
                              </span>
                            </div>

                            {trip.description && (
                              <p className="text-xs text-stone-500 mt-1 line-clamp-2">{trip.description}</p>
                            )}

                            <div className="flex items-center flex-wrap gap-3 mt-2.5 text-[11px] font-semibold text-stone-500">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-stone-400" />
                                {trip.startDate} ~ {trip.endDate}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-mono">
                                <KeyRound className="w-3 h-3" />
                                邀請碼: {trip.inviteCode}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Users className="w-3.5 h-3.5 text-stone-400" />
                                {trip.collaboratorEmails?.length || trip.memberUids?.length || 1} 人共編
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                            {!isCurrent && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectTrip(trip.id);
                                  onClose();
                                }}
                                className="px-3.5 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-colors cursor-pointer"
                              >
                                切換至此行程
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleStartEdit(trip)}
                              className="p-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 transition-colors"
                              title="編輯行程資訊"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {isOwner ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDeleteTrip(trip)}
                                className={cn(
                                  'px-3 py-2 rounded-xl text-xs font-bold border transition-colors inline-flex items-center gap-1',
                                  confirmDeleteId === trip.id
                                    ? 'bg-red-600 text-white border-red-600'
                                    : 'border-red-200 text-red-600 hover:bg-red-50'
                                )}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {confirmDeleteId === trip.id ? '確定刪除？' : '刪除行程'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleLeaveTrip(trip)}
                                className="px-3 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 text-xs font-bold inline-flex items-center gap-1"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                離開共編
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: CREATE */}
          {activeTab === 'create' && (
            <div className="space-y-5 max-w-2xl mx-auto py-1">
              {/* Segmented Switch: AI vs Manual */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-stone-100 border border-stone-200/80">
                <button
                  type="button"
                  onClick={() => {
                    setCreateMode('ai');
                    setErrorMsg(null);
                  }}
                  className={cn(
                    'py-2.5 px-3 rounded-xl text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer',
                    createMode === 'ai'
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  )}
                >
                  <Sparkles className={cn('w-3.5 h-3.5', createMode === 'ai' && 'text-[#00F3FF]')} />
                  AI 辨識企劃書／紙本建立
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateMode('manual');
                    setErrorMsg(null);
                  }}
                  className={cn(
                    'py-2.5 px-3 rounded-xl text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer',
                    createMode === 'manual'
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  )}
                >
                  <Plus className="w-3.5 h-3.5" />
                  手動建立空白行程
                </button>
              </div>

              {createMode === 'ai' ? (
                <AiProposalParserPanel
                  defaultStartDate={newStartDate}
                  showTripMeta={true}
                  submitLabelPrefix="確認建立行程並匯入"
                  busy={busy}
                  onConfirm={handleCreateTripFromAI}
                />
              ) : (
                <form onSubmit={handleCreateTrip} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-stone-700 block mb-1.5">
                      行程名稱 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="例如：2026 北海道冬季五日團"
                      className="w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1.5">
                        開始日期 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1.5">
                        結束日期 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={newEndDate}
                        onChange={(e) => setNewEndDate(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-stone-700 block mb-1.5">行程簡介（選填）</label>
                    <textarea
                      rows={3}
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="可填寫領隊備忘、集合班機或該團特色..."
                      className="w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-3.5 rounded-2xl bg-stone-900 text-white text-sm font-bold shadow-lg hover:bg-stone-800 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {busy ? '正在建立獨立行程空間...' : '建立並切換至此新行程'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: JOIN BY INVITE CODE */}
          {activeTab === 'join' && (
            <form onSubmit={handleJoinByCode} className="space-y-4 max-w-md mx-auto py-4">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-800 flex items-center justify-center mx-auto">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h4 className="font-serif font-bold text-lg text-stone-900">透過邀請碼加入共同管理</h4>
                <p className="text-xs text-stone-500">
                  向行程建立者取得 6 碼邀請碼或點選分享連結，即可即時共編該旅遊團的名單與行程。
                </p>
              </div>

              <div>
                <input
                  type="text"
                  required
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="輸入邀請碼（例如 GT2026）"
                  maxLength={12}
                  className="w-full px-4 py-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-center text-lg font-mono font-black tracking-[0.25em] uppercase focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 rounded-2xl bg-stone-900 text-white text-sm font-bold shadow-lg hover:bg-stone-800 disabled:opacity-50 transition-all cursor-pointer"
              >
                {busy ? '正在驗證並加入...' : '加入此行程'}
              </button>
            </form>
          )}

          {/* TAB 4: SHARE & COLLABORATORS */}
          {activeTab === 'share' && (
            !activeTrip ? (
              <div className="text-center py-12 text-stone-500 text-sm font-bold">
                請先建立或選擇一個行程，才能管理共用邀請碼與協作者。
              </div>
            ) : (
              <div className="space-y-6">
                {/* Invite Code & Share Link Box */}
                <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                        專屬邀請碼（{activeTrip.name}）
                      </p>
                      <div className="text-3xl font-mono font-black tracking-[0.2em] text-stone-900 mt-1">
                        {activeTrip.inviteCode}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleCopy(activeTrip.inviteCode, 'code')}
                        className="px-3.5 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-stone-800"
                      >
                        {copiedType === 'code' ? <Check className="w-3.5 h-3.5 text-[#00F3FF]" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedType === 'code' ? '已複製邀請碼' : '複製邀請碼'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleRegenerateInviteCode}
                        className="px-3.5 py-2 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-stone-100 disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        重新產生
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-stone-200/80 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs font-mono text-stone-600 truncate">
                      {shareUrl}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(shareUrl, 'link')}
                      className="px-3.5 py-2 rounded-xl bg-white border border-stone-200 text-stone-800 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:border-stone-400 whitespace-nowrap"
                    >
                      {copiedType === 'link' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
                      {copiedType === 'link' ? '已複製分享連結' : '複製分享連結'}
                    </button>
                  </div>
                </div>

                {/* Email Collaborator Management */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-stone-500 flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email 共編授權清單
                  </h4>

                  <form onSubmit={handleAddCollaborator} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      value={collabEmailInput}
                      onChange={(e) => setCollabEmailInput(e.target.value)}
                      placeholder="輸入對方的 Google Email（例如 teammate@gmail.com）"
                      className="flex-1 px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      加入共編授權
                    </button>
                  </form>

                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-2xl overflow-hidden bg-white">
                    {(activeTrip.collaboratorEmails || []).map((email) => {
                      const isOwnerEmail = email.toLowerCase() === activeTrip.ownerEmail.toLowerCase();
                      return (
                        <div key={email} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {email.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-stone-800 truncate">{email}</span>
                            {isOwnerEmail && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex-shrink-0">
                                <Crown className="w-3 h-3" /> 建立者
                              </span>
                            )}
                          </div>
                          {!isOwnerEmail && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRemoveCollaborator(email)}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                            >
                              移除
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {(!activeTrip.collaboratorEmails || activeTrip.collaboratorEmails.length === 0) && (
                      <div className="px-4 py-3 text-xs text-stone-400">
                        建立者：{activeTrip.ownerEmail}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
