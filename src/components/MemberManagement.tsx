import React, { useState, useEffect, useMemo } from 'react';
import { Member, Group, Itinerary, TripSettings } from '../types';
import {
  Upload,
  Download,
  Search,
  Trash2,
  Edit2,
  UserPlus,
  MoreVertical,
  X,
  Check,
  Users,
  Crown,
  Calendar,
  Square,
  CheckSquare,
  Plane,
  QrCode,
  FileText,
  Phone,
  FileSpreadsheet
} from 'lucide-react';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
  WriteBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import * as XLSX from 'xlsx';
import { QRCodeSVG } from 'qrcode.react';
import JSZip from 'jszip';
import QRCodePackage from 'qrcode';
import { cn, getMemberTripDayColor } from '../lib/utils';
import PersonalItineraryModal from './PersonalItineraryModal';

interface MemberManagementProps {
  members: Member[];
  groups: Group[];
  itineraries: Itinerary[];
  tripSettings: TripSettings | null;
}

const FIRESTORE_BATCH_LIMIT = 450;

const INITIAL_NEW_MEMBER: Partial<Member> = {
  name: '',
  dietaryHabits: '',
  phone: '',
  passportInfo: '',
  notes: '',
  groupId: '',
  tags: [],
  outboundFlight: '',
  outboundTime: '',
  returnFlight: '',
  returnTime: '',
  isLeader: false,
  gender: '',
  tripDays: undefined
};

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
  const [isClearingBlank, setIsClearingBlank] = useState(false);
  const [viewingItineraryMember, setViewingItineraryMember] = useState<Member | null>(null);
  const [viewingQrCodeMember, setViewingQrCodeMember] = useState<Member | null>(null);
  const [isFlightExpanded, setIsFlightExpanded] = useState(false);
  const [isDownloadingAllQr, setIsDownloadingAllQr] = useState(false);

  const [newMember, setNewMember] = useState<Partial<Member>>(INITIAL_NEW_MEMBER);

  // Close active modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (viewingQrCodeMember) setViewingQrCodeMember(null);
      else if (viewingItineraryMember) setViewingItineraryMember(null);
      else if (isManagingGroups) setIsManagingGroups(false);
      else if (isAddingMember || editingMember) {
        setIsAddingMember(false);
        setEditingMember(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingQrCodeMember, viewingItineraryMember, isManagingGroups, isAddingMember, editingMember]);

  // Reset active group filter if the selected group was deleted
  useEffect(() => {
    if (
      selectedGroupId !== 'all' &&
      selectedGroupId !== 'ungrouped' &&
      !groups.some((g) => g.id === selectedGroupId)
    ) {
      setSelectedGroupId('all');
    }
  }, [groups, selectedGroupId]);

  const commitInChunks = async (operations: Array<(batch: WriteBatch) => void>) => {
    for (let i = 0; i < operations.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = operations.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach((op) => op(batch));
      await batch.commit();
    }
  };

  const resolveGroupId = (rawGroup?: string): string => {
    const trimmed = (rawGroup || '').trim();
    if (!trimmed) return '';
    const found = groups.find((g) => g.id === trimmed || g.name === trimmed);
    return found ? found.id : trimmed;
  };

  const memberMatchesGroup = (member: Member, group: Group): boolean => {
    const gid = (member.groupId || '').toString().trim();
    return gid !== '' && (gid === group.id || gid === group.name);
  };

  const ungroupedMembersCount = useMemo(() => {
    return members.filter((m) => {
      const gid = (m.groupId || '').toString().trim();
      if (!gid) return true;
      return !groups.some((g) => g.id === gid || g.name === gid);
    }).length;
  }, [members, groups]);

  const blankMembers = useMemo(
    () => members.filter((m) => !m.name || !String(m.name).trim()),
    [members]
  );

  const processTagsForTripDays = (tags: string[], currentTripDays?: number) => {
    const tripDayTag = tags.find((t) => /\d+[天dD]$/i.test(t.trim()));
    if (!tripDayTag) return { tags, tripDays: currentTripDays };

    const match = tripDayTag.match(/\d+/);
    if (!match) return { tags, tripDays: currentTripDays };

    const extractedDays = parseInt(match[0], 10);
    if (isNaN(extractedDays)) return { tags, tripDays: currentTripDays };

    return {
      tags: tags.filter((t) => t !== tripDayTag),
      tripDays: extractedDays
    };
  };

  const buildSanitizedMemberFields = (
    data: Partial<Member>,
    processedTags: string[],
    processedDays: number | undefined
  ) => {
    const payload: Record<string, unknown> = {
      name: (data.name || '').trim(),
      dietaryHabits: (data.dietaryHabits || '').trim(),
      phone: (data.phone || '').trim(),
      passportInfo: (data.passportInfo || '').trim(),
      notes: (data.notes || '').trim(),
      groupId: (data.groupId || '').trim(),
      tags: processedTags,
      outboundFlight: (data.outboundFlight || '').trim(),
      outboundTime: (data.outboundTime || '').trim(),
      returnFlight: (data.returnFlight || '').trim(),
      returnTime: (data.returnTime || '').trim(),
      isLeader: Boolean(data.isLeader),
      gender: (data.gender || '').trim(),
      tripDays: processedDays !== undefined && !isNaN(processedDays) ? processedDays : null
    };
    if (data.carNumber !== undefined) {
      payload.carNumber = String(data.carNumber).trim();
    }
    return payload;
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.name?.trim()) return;

    try {
      const { tags: processedTags, tripDays: processedDays } = processTagsForTripDays(
        newMember.tags || [],
        newMember.tripDays
      );
      const sanitized = buildSanitizedMemberFields(newMember, processedTags, processedDays);

      const docRef = await addDoc(collection(db, 'members'), {
        ...sanitized,
        id: Date.now().toString()
      });
      await updateDoc(docRef, { id: docRef.id });
      setIsAddingMember(false);
      setIsFlightExpanded(false);
      setNewMember(INITIAL_NEW_MEMBER);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'members');
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !editingMember.name?.trim()) return;

    try {
      const { tags: processedTags, tripDays: processedDays } = processTagsForTripDays(
        Array.isArray(editingMember.tags) ? editingMember.tags : [],
        editingMember.tripDays
      );
      const sanitized = buildSanitizedMemberFields(editingMember, processedTags, processedDays);
      const memberRef = doc(db, 'members', editingMember.id);
      await updateDoc(memberRef, {
        ...sanitized,
        id: editingMember.id
      });
      setEditingMember(null);
      setIsFlightExpanded(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `members/${editingMember.id}`);
    }
  };

  const handleDeleteMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'members', id));
      setSelectedMemberIds((prev) => prev.filter((mid) => mid !== id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `members/${id}`);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedMemberIds.length === 0) return;

    try {
      const idsToDelete = [...selectedMemberIds];
      await commitInChunks(
        idsToDelete.map((id) => (batch) => {
          batch.delete(doc(db, 'members', id));
        })
      );
      setSelectedMemberIds([]);
      setIsDeletingAll(false);
    } catch (error) {
      console.error('Batch delete failed:', error);
      handleFirestoreError(error, OperationType.DELETE, 'batch');
    }
  };

  const handleClearBlankMembers = async () => {
    if (blankMembers.length === 0) return;
    setIsClearingBlank(true);
    try {
      const blankIds = blankMembers.map((m) => m.id);
      await commitInChunks(
        blankIds.map((id) => (batch) => {
          batch.delete(doc(db, 'members', id));
        })
      );
      setSelectedMemberIds((prev) => prev.filter((id) => !blankIds.includes(id)));
    } catch (error) {
      console.error('Clear blank members failed:', error);
      handleFirestoreError(error, OperationType.DELETE, 'members/blank');
    } finally {
      setIsClearingBlank(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedMemberIds.length === filteredMembers.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(filteredMembers.map((m) => m.id));
    }
  };

  const toggleSelectMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((mid) => mid !== id) : [...prev, id]
    );
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newGroupName.trim();
    if (!trimmedName) return;
    try {
      const docRef = await addDoc(collection(db, 'groups'), {
        name: trimmedName,
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
    if (!editingGroup || !editingGroup.name.trim()) return;
    try {
      await updateDoc(doc(db, 'groups', editingGroup.id), { name: editingGroup.name.trim() });
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

  const handleDownloadTemplate = () => {
    const csvRows = [
      '姓名,組別,飲食,電話,護照,Tags,去程航班,去程時間,回程航班,回程時間,備註',
      '陳大文,第一組,葷食,0911222333,A123456789,"導遊,小隊長",BR192,2026-05-01 07:30,BR191,2026-05-05 14:20,主要窗口與領隊聯絡人',
      '林小美,第一組,素食,0922333444,B987654321,攝影小幫手,JX800,2026-05-01 08:30,JX801,2026-05-05 16:00,需安排靠走道座位',
      '張子強,第二組,不吃牛,0933444555,C112233445,,,,,,行動不便需輪椅協助',
      '王阿雪,第二組,海鮮素,0944555666,D998877665,VIP,,,,,,海鮮過敏請特別留意'
    ];
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'members_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let wb;
      if (file.name.toLowerCase().endsWith('.csv')) {
        const rawText = String(evt.target?.result || '').replace(/^\uFEFF/, '');
        wb = XLSX.read(rawText, { type: 'string', raw: true });
      } else {
        const buffer = evt.target?.result as ArrayBuffer;
        wb = XLSX.read(buffer, { type: 'array' });
      }
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];

      const operations: Array<(batch: WriteBatch) => void> = [];

      data.forEach((rawRow) => {
        const normExact: Record<string, unknown> = {};
        const normLower: Record<string, unknown> = {};
        Object.entries(rawRow).forEach(([k, v]) => {
          const cleanKey = k.replace(/^\uFEFF/, '').trim();
          normExact[cleanKey] = v;
          normLower[cleanKey.toLowerCase()] = v;
        });

        const getCell = (...keys: string[]): string => {
          for (const key of keys) {
            const val = normExact[key] ?? normLower[key.toLowerCase()];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              return String(val).trim();
            }
          }
          return '';
        };

        const name = getCell('Name', '姓名', '團員姓名', '會員姓名');
        if (!name) return;

        const dietary = getCell('Dietary', '飲食', '飲食偏好', '飲食習慣');
        const phone = getCell('Phone', 'Tel', 'Mobile', '電話', '聯絡電話', '手機');
        const passport = getCell('Passport', '護照', '護照號碼');
        const groupRaw = getCell('Group', '組別', '小組');
        const groupId = resolveGroupId(groupRaw);
        const tagsRaw = getCell('Tags', 'Tag', '標籤');
        const notes = getCell('Notes', 'Note', 'Remarks', 'Remark', '備註', '備注', '說明');
        const outboundFlight = getCell('OutboundFlight', '去程航班');
        const outboundTime = getCell('OutboundTime', '去程時間');
        const returnFlight = getCell('ReturnFlight', '回程航班');
        const returnTime = getCell('ReturnTime', '回程時間');
        const gender = getCell('Gender', '性別', '男女');
        const leaderRaw = getCell('IsLeader', '組長', '是否為組長').toLowerCase();
        const isLeader = ['true', '1', 'yes', '是'].includes(leaderRaw);

        const rawTags = tagsRaw
          ? tagsRaw.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
          : [];
        const daysStr = getCell('TripDays', '天數', '行程天數');
        const parsedDays = daysStr ? parseInt(daysStr, 10) : undefined;
        const rawDays = parsedDays !== undefined && !isNaN(parsedDays) ? parsedDays : undefined;

        const { tags: processedTags, tripDays: processedDays } = processTagsForTripDays(rawTags, rawDays);

        const newDocRef = doc(collection(db, 'members'));
        operations.push((batch) => {
          batch.set(newDocRef, {
            id: newDocRef.id,
            name,
            dietaryHabits: dietary,
            phone,
            passportInfo: passport,
            notes,
            groupId,
            tags: processedTags,
            outboundFlight,
            outboundTime,
            returnFlight,
            returnTime,
            isLeader,
            gender,
            tripDays: processedDays !== undefined ? processedDays : null
          });
        });
      });

      try {
        if (operations.length === 0) {
          alert(`沒有找到可匯入的有效名單！讀取到的總列數：${data.length}。請確認檔案格式或表頭。`);
          return;
        }
        await commitInChunks(operations);
        alert(`成功匯入了 ${operations.length} 位成員！`);
      } catch (error) {
        console.error('Error batch importing members:', error);
        alert('匯入失敗，請確認資料結構或登入權限。');
      }
    };

    if (file.name.toLowerCase().endsWith('.csv')) {
      reader.readAsText(file, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(file);
    }

    e.target.value = '';
  };

  const handleDownloadQrCode = (member: Member) => {
    const svg = document.getElementById(`qr-code-${member.id}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      }
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `${member.name}_QRCode.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleDownloadAllQrCodes = async () => {
    if (members.length === 0) return;
    setIsDownloadingAllQr(true);
    try {
      const zip = new JSZip();
      for (const member of members) {
        const dataUrl = await QRCodePackage.toDataURL(member.id, {
          width: 400,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' }
        });
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        const safeName = (member.name || member.id).replace(/[/\\?%*:|"<>]/g, '_');
        zip.file(`${safeName}_QRCode.png`, base64Data, { base64: true });
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = '所有團員_QRCodes.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate QR Codes zip', error);
      alert('產生 QR Code 壓縮檔時發生錯誤！');
    } finally {
      setIsDownloadingAllQr(false);
    }
  };

  const filteredMembers = members.filter((m) => {
    const q = searchTerm.trim().toLowerCase();
    const matchedGroup = groups.find(
      (g) => g.id === m.groupId || g.name === m.groupId
    );
    const matchesSearch =
      !q ||
      (m.name || '').toLowerCase().includes(q) ||
      (m.phone || '').toLowerCase().includes(q) ||
      (m.notes || '').toLowerCase().includes(q) ||
      (m.dietaryHabits || '').toLowerCase().includes(q) ||
      (matchedGroup?.name || '').toLowerCase().includes(q) ||
      (Array.isArray(m.tags)
        ? m.tags.some((tag) => String(tag).toLowerCase().includes(q))
        : typeof m.tags === 'string' &&
          (m.tags as string).toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (selectedGroupId === 'all') return true;
    if (selectedGroupId === 'ungrouped') {
      const gid = (m.groupId || '').toString().trim();
      return !gid || !groups.some((g) => g.id === gid || g.name === gid);
    }
    const targetGroup = groups.find((g) => g.id === selectedGroupId);
    return targetGroup ? memberMatchesGroup(m, targetGroup) : m.groupId === selectedGroupId;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-light mb-1">名單管理</h2>
          <p className="text-stone-500">管理目前共 {members.length} 位參與團員。</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {blankMembers.length > 0 && (
            <button
              onClick={handleClearBlankMembers}
              disabled={isClearingBlank}
              className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-full text-sm font-bold hover:bg-amber-100 transition-all shadow-sm whitespace-nowrap disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {isClearingBlank ? '清理中...' : `清除空白名單 (${blankMembers.length})`}
            </button>
          )}

          {selectedMemberIds.length > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
              {isDeletingAll ? (
                <div className="flex items-center gap-2 bg-red-50 p-1 rounded-full border border-red-200">
                  <button
                    onClick={handleDeleteSelected}
                    className="bg-red-500 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-colors shadow-sm whitespace-nowrap"
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
                  className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-full text-sm font-bold hover:bg-red-100 transition-all shadow-sm whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  刪除選中 ({selectedMemberIds.length})
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setIsManagingGroups(true)}
            className="flex items-center gap-2 bg-white border border-stone-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-stone-50 transition-colors shadow-sm whitespace-nowrap"
          >
            <Users className="w-4 h-4" />
            管理組別
          </button>

          <button
            onClick={handleDownloadAllQrCodes}
            disabled={isDownloadingAllQr || members.length === 0}
            className="flex items-center gap-2 bg-white border border-stone-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-stone-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isDownloadingAllQr ? (
              <span className="w-4 h-4 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            下載所有 QR Code
          </button>

          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 bg-white border border-stone-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-stone-50 transition-colors shadow-sm whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            下載範本
          </button>

          <label className="flex items-center gap-2 bg-white border border-stone-200 px-4 py-2 rounded-full text-sm font-medium cursor-pointer hover:bg-stone-50 transition-colors shadow-sm whitespace-nowrap">
            <Upload className="w-4 h-4" />
            批次匯入名單
            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
          </label>

          <button
            onClick={() => {
              setNewMember(INITIAL_NEW_MEMBER);
              setIsFlightExpanded(false);
              setIsAddingMember(true);
            }}
            className="flex items-center gap-2 bg-stone-900 text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm whitespace-nowrap"
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
            placeholder="搜尋姓名、電話、組別、標籤或備註..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-transparent rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 transition-all focus:bg-white focus:border-[#00F3FF] focus:brightness-110 font-medium"
          />
        </div>

        <div className="flex-1 w-full flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setSelectedGroupId('all')}
            className={cn(
              'flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200',
              selectedGroupId === 'all'
                ? 'bg-stone-900 text-white border-stone-900 shadow-lg scale-105'
                : 'bg-white text-stone-500 border-stone-100 hover:border-stone-200 hover:bg-stone-50'
            )}
          >
            <Users className="w-3.5 h-3.5" />
            所有成員 ({members.length})
          </button>

          <div className="w-px h-6 bg-stone-100 flex-shrink-0 mx-1" />

          {groups.map((g) => {
            const count = members.filter((m) => memberMatchesGroup(m, g)).length;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(g.id)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200',
                  selectedGroupId === g.id
                    ? 'bg-stone-900 text-white border-stone-900 shadow-lg scale-105'
                    : 'bg-white text-stone-500 border-stone-100 hover:border-stone-200 hover:bg-stone-50'
                )}
              >
                {g.name} ({count})
              </button>
            );
          })}

          {ungroupedMembersCount > 0 && (
            <button
              onClick={() => setSelectedGroupId('ungrouped')}
              className={cn(
                'flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200',
                selectedGroupId === 'ungrouped'
                  ? 'bg-stone-900 text-white border-stone-900 shadow-lg scale-105'
                  : 'bg-white text-stone-500 border-stone-100 hover:border-stone-200 hover:bg-stone-50'
              )}
            >
              未分組 ({ungroupedMembersCount})
            </button>
          )}
        </div>
      </div>

      {/* Member List */}
      <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-4 sm:px-6 py-4 w-10">
                  <button
                    onClick={toggleSelectAll}
                    className="p-1 text-stone-400 hover:text-stone-900 transition-colors"
                    aria-label="全選或取消全選"
                  >
                    {selectedMemberIds.length === filteredMembers.length && filteredMembers.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-stone-900" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th className="px-2 sm:px-4 xl:px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap min-w-[160px]">
                  姓名 / 聯絡 / 備註
                </th>
                <th className="px-2 sm:px-4 xl:px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap hidden lg:table-cell">
                  組別
                </th>
                <th className="px-2 sm:px-4 xl:px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap hidden md:table-cell">
                  天數
                </th>
                <th className="px-2 sm:px-4 xl:px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap hidden xl:table-cell">
                  性別
                </th>
                <th className="px-2 sm:px-4 xl:px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap hidden lg:table-cell">
                  飲食偏好
                </th>
                <th className="sticky right-0 z-10 bg-stone-50/95 backdrop-blur-xs shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.06)] px-3 sm:px-4 xl:px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredMembers.map((member) => {
                const resolvedGroupValue =
                  groups.find((g) => g.id === member.groupId || g.name === member.groupId)?.id || '';
                const tagList = Array.isArray(member.tags)
                  ? member.tags
                  : typeof member.tags === 'string' && member.tags
                    ? String(member.tags).split(',').map((t) => t.trim()).filter(Boolean)
                    : [];

                return (
                  <tr
                    key={member.id}
                    className={cn(
                      'hover:bg-stone-50 transition-colors group whitespace-nowrap',
                      selectedMemberIds.includes(member.id) && 'bg-stone-50/80'
                    )}
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <button
                        onClick={() => toggleSelectMember(member.id)}
                        className="p-1 text-stone-400 hover:text-stone-900 transition-colors"
                      >
                        {selectedMemberIds.includes(member.id) ? (
                          <CheckSquare className="w-5 h-5 text-stone-900 shadow-sm" />
                        ) : (
                          <Square className="w-5 h-5 opacity-40 group-hover:opacity-100" />
                        )}
                      </button>
                    </td>

                    <td className="px-2 sm:px-4 xl:px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-600 flex-shrink-0">
                          {(member.name || '?').charAt(0)}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-stone-900">
                              {member.name || '(未命名成員)'}
                            </span>
                            {member.isLeader && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">
                                <Crown className="w-2.5 h-2.5" />
                                組長
                              </span>
                            )}
                          </div>

                          {(member.phone || member.notes) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {member.phone && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 text-[10px] font-mono">
                                  <Phone className="w-2.5 h-2.5" />
                                  {member.phone}
                                </span>
                              )}
                              {member.notes && (
                                <span
                                  title={member.notes}
                                  className="spring-interactive inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50/90 border border-amber-200/80 text-amber-900 text-[10px] font-medium max-w-[180px] truncate"
                                >
                                  <FileText className="w-2.5 h-2.5 text-amber-600 flex-shrink-0" />
                                  <span className="truncate">{member.notes}</span>
                                </span>
                              )}
                            </div>
                          )}

                          {(member.outboundFlight || member.returnFlight) && (
                            <div className="text-[10px] text-stone-500 flex gap-2 font-mono tracking-tighter mt-0.5">
                              {member.outboundFlight && <span>✈️ {member.outboundFlight}</span>}
                              {member.returnFlight && <span>🏠 {member.returnFlight}</span>}
                            </div>
                          )}

                          {tagList.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {tagList.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-[10px] font-medium border border-stone-200/60 shadow-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-2 sm:px-4 xl:px-6 py-4 hidden lg:table-cell">
                      <select
                        value={resolvedGroupValue}
                        disabled={Boolean(member.isLeader)}
                        title={member.isLeader ? '組長不可直接快速更換組別' : '切換組別'}
                        onChange={(e) => handleQuickGroupChange(member.id, e.target.value)}
                        className={cn(
                          'bg-transparent text-sm font-medium text-stone-600 focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 rounded-lg px-2 py-1.5 -ml-2 transition-all duration-200 ease-out',
                          member.isLeader
                            ? 'opacity-60 cursor-not-allowed'
                            : 'hover:bg-stone-100 cursor-pointer active:border-[#00F3FF] active:brightness-110'
                        )}
                      >
                        <option value="">未分組</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-2 sm:px-4 xl:px-6 py-4 hidden md:table-cell">
                      <span
                        className={cn(
                          'px-3 py-1 rounded-full text-xs font-black border whitespace-nowrap',
                          getMemberTripDayColor(member.tripDays)
                        )}
                      >
                        {member.tripDays ? `${member.tripDays} 天` : '未標註'}
                      </span>
                    </td>

                    <td className="px-2 sm:px-4 xl:px-6 py-4 hidden xl:table-cell">
                      <span
                        className={cn(
                          'text-xs px-2 py-1 rounded-full font-medium',
                          member.gender === '男' || member.gender === 'M'
                            ? 'bg-stone-50 text-stone-600 border border-stone-200'
                            : member.gender === '女' || member.gender === 'F'
                              ? 'bg-stone-50 text-stone-600 border border-stone-200'
                              : 'bg-stone-50/50 text-stone-500 border border-stone-100/50'
                        )}
                      >
                        {member.gender === '男' || member.gender === 'M'
                          ? '男'
                          : member.gender === '女' || member.gender === 'F'
                            ? '女'
                            : '未設定'}
                      </span>
                    </td>

                    <td className="px-2 sm:px-4 xl:px-6 py-4 hidden lg:table-cell">
                      <span
                        className={cn(
                          'text-xs px-2 py-1 rounded-full font-medium',
                          member.dietaryHabits?.includes('素')
                            ? 'bg-green-100 text-green-700'
                            : 'bg-stone-100 text-stone-600'
                        )}
                      >
                        {member.dietaryHabits || '一般 (葷)'}
                      </span>
                    </td>

                    <td className="sticky right-0 z-10 bg-white/95 backdrop-blur-xs group-hover:bg-stone-50/95 shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.06)] px-2 sm:px-4 xl:px-6 py-4 text-right">
                      {deletingId === member.id ? (
                        <div className="flex items-center justify-end gap-1 bg-red-50 p-1 rounded-lg border border-red-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMember(member.id);
                            }}
                            className="px-2 py-1 bg-red-500 text-white text-[10px] font-black rounded-md shadow-sm hover:bg-red-600 transition-colors"
                          >
                            確認
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(null);
                            }}
                            className="p-1 text-stone-400 hover:text-stone-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                          <button
                            onClick={() => setViewingQrCodeMember(member)}
                            className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                            title="顯示專屬 QR Code"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setViewingItineraryMember(member)}
                            className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                            title="查看個人行程"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingMember({
                                ...member,
                                groupId: resolveGroupId(member.groupId),
                                tags: tagList
                              });
                              setIsFlightExpanded(false);
                            }}
                            className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                            title="編輯成員"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingId(member.id)}
                            className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="刪除成員"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-stone-500">
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
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div
            onClick={() => {
              setIsAddingMember(false);
              setEditingMember(null);
            }}
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
          />
          <div className="relative bg-white w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-serif">{isAddingMember ? '新增成員' : '編輯成員'}</h3>
              <button
                onClick={() => {
                  setIsAddingMember(false);
                  setEditingMember(null);
                }}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={isAddingMember ? handleAddMember : handleUpdateMember} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    姓名 (Full Name)
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={isAddingMember ? newMember.name || '' : editingMember?.name || ''}
                    onChange={(e) =>
                      isAddingMember
                        ? setNewMember({ ...newMember, name: e.target.value })
                        : setEditingMember({ ...editingMember!, name: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    聯絡電話 (Phone)
                  </label>
                  <input
                    type="tel"
                    placeholder="例如: 0911222333"
                    value={isAddingMember ? newMember.phone || '' : editingMember?.phone || ''}
                    onChange={(e) =>
                      isAddingMember
                        ? setNewMember({ ...newMember, phone: e.target.value })
                        : setEditingMember({ ...editingMember!, phone: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    行程天數 (Trip Days)
                  </label>
                  <input
                    type="number"
                    placeholder="例如: 9"
                    value={isAddingMember ? newMember.tripDays || '' : editingMember?.tripDays || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                      isAddingMember
                        ? setNewMember({ ...newMember, tripDays: val })
                        : setEditingMember({ ...editingMember!, tripDays: val });
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    性別 (Gender)
                  </label>
                  <select
                    value={isAddingMember ? newMember.gender || '' : editingMember?.gender || ''}
                    onChange={(e) =>
                      isAddingMember
                        ? setNewMember({ ...newMember, gender: e.target.value })
                        : setEditingMember({ ...editingMember!, gender: e.target.value })
                    }
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
                    const existingLeader = members.find(
                      (m) =>
                        currentGroupId &&
                        (m.groupId === currentGroupId) &&
                        m.isLeader &&
                        m.id !== (editingMember?.id || '')
                    );
                    const isAlreadyLeader = isAddingMember ? newMember.isLeader : editingMember?.isLeader;

                    return (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-end gap-4 sm:gap-6">
                          <div className="flex-1">
                            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1 flex justify-between items-center">
                              <span>所屬組別 (Group)</span>
                              {!isAddingMember && editingMember?.isLeader && (
                                <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                  組長不可更改小組
                                </span>
                              )}
                            </label>
                            <select
                              disabled={!isAddingMember && Boolean(editingMember?.isLeader)}
                              value={isAddingMember ? newMember.groupId || '' : editingMember?.groupId || ''}
                              onChange={(e) =>
                                isAddingMember
                                  ? setNewMember({ ...newMember, groupId: e.target.value })
                                  : setEditingMember({ ...editingMember!, groupId: e.target.value })
                              }
                              className={cn(
                                'w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5',
                                !isAddingMember && editingMember?.isLeader && 'opacity-60 cursor-not-allowed bg-stone-100'
                              )}
                            >
                              <option value="">尚未分組</option>
                              {groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="pb-2">
                            <label
                              className={cn(
                                'flex items-center gap-2 cursor-pointer group/leader transition-all',
                                existingLeader && !isAlreadyLeader && 'cursor-not-allowed opacity-50'
                              )}
                            >
                              <div
                                onClick={() => {
                                  if (existingLeader && !isAlreadyLeader) return;
                                  if (isAddingMember)
                                    setNewMember({ ...newMember, isLeader: !newMember.isLeader });
                                  else
                                    setEditingMember({
                                      ...editingMember!,
                                      isLeader: !editingMember!.isLeader
                                    });
                                }}
                                className={cn(
                                  'w-6 h-6 rounded-lg border transition-all flex items-center justify-center shadow-sm',
                                  isAlreadyLeader
                                    ? 'bg-amber-500 border-amber-500 text-white shadow-amber-200'
                                    : 'bg-white border-stone-200 group-hover/leader:border-amber-400'
                                )}
                              >
                                {isAlreadyLeader && <Check className="w-4 h-4" strokeWidth={3} />}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-stone-900 leading-none">設為小組長</span>
                                <span className="text-[9px] text-stone-500 font-bold uppercase tracking-tighter mt-1">
                                  Set as Leader
                                </span>
                              </div>
                            </label>
                          </div>
                        </div>
                        {existingLeader && !isAlreadyLeader && (
                          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
                            <span className="text-[10px] text-amber-700 font-bold">
                              ⚠️ 此小組已有組長 ({existingLeader.name})，不可重複設定。
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    飲食偏好 (Dietary)
                  </label>
                  <select
                    value={isAddingMember ? newMember.dietaryHabits || '' : editingMember?.dietaryHabits || ''}
                    onChange={(e) =>
                      isAddingMember
                        ? setNewMember({ ...newMember, dietaryHabits: e.target.value })
                        : setEditingMember({ ...editingMember!, dietaryHabits: e.target.value })
                    }
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    護照號碼 (Passport)
                  </label>
                  <input
                    type="text"
                    value={isAddingMember ? newMember.passportInfo || '' : editingMember?.passportInfo || ''}
                    onChange={(e) =>
                      isAddingMember
                        ? setNewMember({ ...newMember, passportInfo: e.target.value })
                        : setEditingMember({ ...editingMember!, passportInfo: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    標籤 (Tags) - 用逗號分隔
                  </label>
                  <input
                    type="text"
                    placeholder="例如: 導遊, VIP, 攝影小幫手"
                    value={
                      isAddingMember
                        ? (newMember.tags || []).join(', ')
                        : (editingMember?.tags || []).join(', ')
                    }
                    onChange={(e) => {
                      const tagsArray = e.target.value
                        .split(/[,，]/)
                        .map((t) => t.trim())
                        .filter(Boolean);
                      const { tags: processedTags, tripDays: processedDays } = processTagsForTripDays(
                        tagsArray,
                        isAddingMember ? newMember.tripDays : editingMember?.tripDays
                      );

                      if (isAddingMember) {
                        setNewMember({ ...newMember, tags: processedTags, tripDays: processedDays });
                      } else {
                        setEditingMember({
                          ...editingMember!,
                          tags: processedTags,
                          tripDays: processedDays
                        });
                      }
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 text-sm"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                    備註 (Notes)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="例如：行動不便需輪椅協助、過敏史、靠走道座位..."
                    value={isAddingMember ? newMember.notes || '' : editingMember?.notes || ''}
                    onChange={(e) =>
                      isAddingMember
                        ? setNewMember({ ...newMember, notes: e.target.value })
                        : setEditingMember({ ...editingMember!, notes: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 text-sm resize-y"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <button
                    type="button"
                    onClick={() => setIsFlightExpanded(!isFlightExpanded)}
                    className={cn(
                      'w-full flex items-center justify-between p-4 bg-stone-50 border transition-all duration-200 ease-out font-bold text-stone-900 group rounded-2xl',
                      isFlightExpanded
                        ? 'border-[#00F3FF] ring-2 ring-[#00F3FF]/10 brightness-110'
                        : 'border-stone-200 hover:scale-[1.02] hover:shadow-[0_5px_15px_-5px_rgba(0,0,0,0.1)] active:brightness-110 active:border-[#00F3FF]'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          isFlightExpanded
                            ? 'bg-stone-900 text-white'
                            : 'bg-stone-200 text-stone-600 group-hover:bg-stone-900 group-hover:text-white'
                        )}
                      >
                        <Plane className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-sm">航班資訊 (Flight Info)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded-full">
                        {isFlightExpanded ? '點擊收合' : '點擊展開'}
                      </span>
                      <MoreVertical
                        className={cn('w-4 h-4 text-stone-400 transition-transform', isFlightExpanded && 'rotate-90')}
                      />
                    </div>
                  </button>

                  {isFlightExpanded && (
                    <div className="p-5 border border-stone-200 rounded-2xl bg-white space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-stone-500">
                            去程航班 (Outbound)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. BR192"
                            value={isAddingMember ? newMember.outboundFlight || '' : editingMember?.outboundFlight || ''}
                            onChange={(e) =>
                              isAddingMember
                                ? setNewMember({ ...newMember, outboundFlight: e.target.value })
                                : setEditingMember({ ...editingMember!, outboundFlight: e.target.value })
                            }
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-stone-500">
                            去程時間 (Time)
                          </label>
                          <input
                            type="text"
                            placeholder="例如: 05/01 07:30"
                            value={isAddingMember ? newMember.outboundTime || '' : editingMember?.outboundTime || ''}
                            onChange={(e) =>
                              isAddingMember
                                ? setNewMember({ ...newMember, outboundTime: e.target.value })
                                : setEditingMember({ ...editingMember!, outboundTime: e.target.value })
                            }
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-stone-500">
                            回程航班 (Return)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. BR191"
                            value={isAddingMember ? newMember.returnFlight || '' : editingMember?.returnFlight || ''}
                            onChange={(e) =>
                              isAddingMember
                                ? setNewMember({ ...newMember, returnFlight: e.target.value })
                                : setEditingMember({ ...editingMember!, returnFlight: e.target.value })
                            }
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-stone-500">
                            回程時間 (Time)
                          </label>
                          <input
                            type="text"
                            placeholder="例如: 05/05 14:20"
                            value={isAddingMember ? newMember.returnTime || '' : editingMember?.returnTime || ''}
                            onChange={(e) =>
                              isAddingMember
                                ? setNewMember({ ...newMember, returnTime: e.target.value })
                                : setEditingMember({ ...editingMember!, returnTime: e.target.value })
                            }
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
                  onClick={() => {
                    setIsAddingMember(false);
                    setEditingMember(null);
                  }}
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

      {/* QR Code Modal */}
      {viewingQrCodeMember && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div
            onClick={() => setViewingQrCodeMember(null)}
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
          />
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-6">
              <h3 className="text-xl font-serif font-black">{viewingQrCodeMember.name} 的專屬條碼</h3>
              <button
                onClick={() => setViewingQrCodeMember(null)}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-stone-100 mb-6 flex flex-col items-center">
              <QRCodeSVG
                id={`qr-code-${viewingQrCodeMember.id}`}
                value={viewingQrCodeMember.id}
                size={220}
                level="H"
                includeMargin={true}
              />
              <p className="mt-4 text-xs font-bold text-stone-500 tracking-wider">請將此條碼出示給領隊掃描</p>
            </div>

            <button
              onClick={() => handleDownloadQrCode(viewingQrCodeMember)}
              className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white py-3 rounded-xl font-bold hover:bg-stone-800 transition-colors shadow-sm active:scale-95"
            >
              <Download className="w-5 h-5" />
              下載 QR Code 圖片
            </button>
          </div>
        </div>
      )}

      {/* Group Management Modal */}
      {isManagingGroups && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div
            onClick={() => setIsManagingGroups(false)}
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
          />
          <div className="relative bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-serif">管理組別 (Manage Groups)</h3>
              <button onClick={() => setIsManagingGroups(false)} className="text-stone-500 hover:text-stone-900">
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
                className="bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors whitespace-nowrap"
              >
                新增
              </button>
            </form>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-100"
                >
                  {editingGroup?.id === group.id ? (
                    <form onSubmit={handleUpdateGroup} className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={editingGroup.name}
                        onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                        className="flex-1 px-2 py-1 bg-white border border-stone-200 rounded text-sm"
                        autoFocus
                      />
                      <button type="submit" className="text-green-600 hover:text-green-700">
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGroup(null)}
                        className="text-stone-400 hover:text-stone-600"
                      >
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
                <p className="text-center py-4 text-stone-500 text-sm">目前尚未建立任何組別。</p>
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
