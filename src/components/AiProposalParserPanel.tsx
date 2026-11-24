import React, { useState, useRef } from 'react';
import { differenceInDays, format, isValid, parseISO } from 'date-fns';
import {
  Sparkles,
  Upload,
  FileText,
  X,
  Plus,
  Trash2,
  KeyRound,
  Calendar,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  CheckCircle2,
  MapPin,
  Clock,
  Users,
  Plane
} from 'lucide-react';
import { ItineraryType } from '../types';
import {
  CUSTOM_GEMINI_KEY_STORAGE,
  ParsedItineraryItem,
  ParsedMemberItem,
  ParsedTripProposal,
  SAMPLE_PROPOSAL_TEXT,
  parseTripProposalWithAI,
  shiftIsoDate
} from '../lib/aiTripParser';
import { cn } from '../lib/utils';

interface AiProposalParserPanelProps {
  defaultStartDate: string;
  showTripMeta: boolean;
  submitLabelPrefix: string;
  busy?: boolean;
  onConfirm: (proposal: ParsedTripProposal) => Promise<void>;
}

const ITINERARY_TYPE_OPTIONS: { value: ItineraryType; label: string }[] = [
  { value: 'attraction', label: '景點活動' },
  { value: 'dining', label: '餐飲美食' },
  { value: 'transit', label: '交通航班' },
  { value: 'accommodation', label: '飯店住宿' },
  { value: 'logistics', label: '集合行政' },
];

export default function AiProposalParserPanel({
  defaultStartDate,
  showTripMeta,
  submitLabelPrefix,
  busy = false,
  onConfirm,
}: AiProposalParserPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [rawText, setRawText] = useState('');
  const [memberNamesText, setMemberNamesText] = useState('');
  const [anchorStartDate, setAnchorStartDate] = useState(
    defaultStartDate || format(new Date(), 'yyyy-MM-dd')
  );
  const [showApiKeyConfig, setShowApiKeyConfig] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem(CUSTOM_GEMINI_KEY_STORAGE) || ''
      : ''
  );

  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedTripProposal | null>(null);

  const handleFilesSelected = (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const incoming = Array.from(selectedFiles);
    setFiles((prev) => [...prev, ...incoming]);
    setParseError(null);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApiKeyChange = (val: string) => {
    setCustomApiKey(val);
    if (typeof window !== 'undefined') {
      if (val.trim()) {
        localStorage.setItem(CUSTOM_GEMINI_KEY_STORAGE, val.trim());
      } else {
        localStorage.removeItem(CUSTOM_GEMINI_KEY_STORAGE);
      }
    }
  };

  const handleStartParse = async () => {
    setParseError(null);
    setIsParsing(true);
    try {
      const parsed = await parseTripProposalWithAI({
        files,
        rawText,
        memberNamesText: showTripMeta ? memberNamesText : '',
        defaultStartDate: anchorStartDate,
        customApiKey: customApiKey.trim() || undefined,
      });
      setPreview(parsed);
    } catch (err: any) {
      setParseError(err?.message || 'AI 辨識失敗，請稍後再試。');
    } finally {
      setIsParsing(false);
    }
  };

  const handleStartDateShift = (nextStartDate: string) => {
    if (!preview || !nextStartDate) return;
    const oldStart = parseISO(preview.startDate);
    const newStart = parseISO(nextStartDate);
    if (!isValid(oldStart) || !isValid(newStart)) {
      setPreview({ ...preview, startDate: nextStartDate });
      return;
    }

    const deltaDays = differenceInDays(newStart, oldStart);
    if (deltaDays === 0) return;

    setPreview({
      ...preview,
      startDate: nextStartDate,
      officialStartDate: shiftIsoDate(preview.officialStartDate || preview.startDate, deltaDays),
      endDate: shiftIsoDate(preview.endDate, deltaDays),
      items: preview.items.map((item) => ({
        ...item,
        date: shiftIsoDate(item.date, deltaDays),
      })),
    });
  };

  const updateMemberItem = (id: string, patch: Partial<ParsedMemberItem>) => {
    if (!preview) return;
    setPreview({
      ...preview,
      members: preview.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  };

  const updateItem = (id: string, patch: Partial<ParsedItineraryItem>) => {
    if (!preview) return;
    setPreview({
      ...preview,
      items: preview.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    });
  };

  const removeItem = (id: string) => {
    if (!preview) return;
    setPreview({
      ...preview,
      items: preview.items.filter((item) => item.id !== id),
    });
  };

  const addEmptyItem = () => {
    if (!preview) return;
    const lastDate =
      preview.items.length > 0
        ? preview.items[preview.items.length - 1].date
        : preview.startDate;
    setPreview({
      ...preview,
      items: [
        ...preview.items,
        {
          id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          selected: true,
          date: lastDate,
          startTime: '09:00',
          endTime: '',
          title: '新行程活動',
          type: 'attraction',
          address: '',
          notes: '',
          isMain: true,
        },
      ],
    });
  };

  const selectedCount = preview
    ? preview.items.filter((i) => i.selected && i.title.trim().length > 0).length
    : 0;
  const selectedMemberCount = preview
    ? preview.members.filter((m) => m.selected && m.name.trim().length > 0).length
    : 0;

  const handleSubmitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;
    if (showTripMeta && !preview.name.trim()) {
      setParseError('請填寫行程名稱。');
      return;
    }
    if (showTripMeta && preview.startDate > preview.endDate) {
      setParseError('結束日期不能早於開始日期。');
      return;
    }
    setParseError(null);
    try {
      await onConfirm(preview);
    } catch (err: any) {
      setParseError(err?.message || '儲存辨識結果失敗，請稍後再試。');
    }
  };

  // Loading Skeleton Shimmer View
  if (isParsing) {
    return (
      <div className="p-6 rounded-3xl glass-panel border border-[#00F3FF]/35 space-y-5 shadow-inner">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-stone-900 text-[#00F3FF] flex items-center justify-center animate-pulse">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-stone-900">
              AI 正在閱讀企劃書與紙本安排...
            </p>
            <p className="text-xs text-stone-500">
              正在自動辨識旅遊日期、時段、交通、餐飲與住宿分類
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-12 w-full rounded-2xl skeleton-shimmer" />
          <div className="h-20 w-full rounded-2xl skeleton-shimmer" />
          <div className="h-20 w-5/6 rounded-2xl skeleton-shimmer" />
        </div>
      </div>
    );
  }

  // Interactive Preview & Edit View
  if (preview) {
    return (
      <form onSubmit={handleSubmitConfirm} className="space-y-4">
        {parseError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
            {parseError}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-stone-900">
                AI 辨識完成！已解析 {preview.items.length} 筆明細
              </p>
              <p className="text-[11px] text-stone-500">
                可自由修改標題、日期時間（調整開始日會自動平移全部明細日期）或取消勾選不匯入項目
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setParseError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-bold text-stone-700 hover:bg-stone-100 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重新辨識 / 返回編輯來源
          </button>
        </div>

        {showTripMeta && (
          <div className="p-4 rounded-2xl bg-stone-50/70 border border-stone-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                  行程名稱 *
                </label>
                <input
                  type="text"
                  required
                  value={preview.name}
                  onChange={(e) => setPreview({ ...preview, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-stone-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                  行程簡介
                </label>
                <input
                  type="text"
                  value={preview.description}
                  onChange={(e) =>
                    setPreview({ ...preview, description: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                  開始日期（修改會自動平移明細）
                </label>
                <input
                  type="date"
                  required
                  value={preview.startDate}
                  onChange={(e) => handleStartDateShift(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-stone-200 text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                  結束日期
                </label>
                <input
                  type="date"
                  required
                  value={preview.endDate}
                  onChange={(e) => setPreview({ ...preview, endDate: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-stone-200 text-sm font-bold"
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
          {preview.items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'p-3.5 rounded-2xl border transition-all space-y-2.5',
                item.selected
                  ? 'bg-white border-stone-200 shadow-sm'
                  : 'bg-stone-50/70 border-stone-200/60 opacity-60'
              )}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={(e) => updateItem(item.id, { selected: e.target.checked })}
                  className="w-4 h-4 accent-stone-900 rounded cursor-pointer"
                  aria-label="勾選匯入"
                />
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  <input
                    type="date"
                    value={item.date}
                    onChange={(e) => updateItem(item.id, { date: e.target.value })}
                    className="px-2.5 py-1.5 rounded-lg bg-stone-50 border border-stone-200 text-xs font-bold"
                  />
                  <div className="inline-flex items-center gap-1 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1">
                    <Clock className="w-3 h-3 text-stone-400" />
                    <input
                      type="time"
                      value={item.startTime}
                      onChange={(e) => updateItem(item.id, { startTime: e.target.value })}
                      className="bg-transparent text-xs font-mono font-bold focus:outline-none"
                    />
                    <span className="text-stone-400 text-xs">-</span>
                    <input
                      type="time"
                      value={item.endTime}
                      onChange={(e) => updateItem(item.id, { endTime: e.target.value })}
                      className="bg-transparent text-xs font-mono focus:outline-none"
                    />
                  </div>
                  <select
                    value={item.type}
                    onChange={(e) =>
                      updateItem(item.id, { type: e.target.value as ItineraryType })
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-stone-50 border border-stone-200 text-xs font-bold"
                  >
                    {ITINERARY_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => updateItem(item.id, { isMain: !item.isMain })}
                    className={cn(
                      'px-2 py-1 rounded-lg text-[10px] font-black border cursor-pointer',
                      item.isMain
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    )}
                  >
                    {item.isMain ? '主團行程' : '自由/選配'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="移除此項目"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => updateItem(item.id, { title: e.target.value })}
                  placeholder="活動標題"
                  className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-sm font-bold text-stone-900"
                />
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={item.address}
                    onChange={(e) => updateItem(item.id, { address: e.target.value })}
                    placeholder="地點 / 地址（選填）"
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-700"
                  />
                </div>
              </div>

              <input
                type="text"
                value={item.notes}
                onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                placeholder="備註 / 提醒事項（選填）"
                className="w-full px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600"
              />
            </div>
          ))}
        </div>

        {showTripMeta && preview.members.length > 0 && (
          <div className="p-4 rounded-2xl bg-stone-50/70 border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h5 className="text-xs font-bold text-stone-800 inline-flex items-center gap-1.5">
                <Users className="w-4 h-4 text-stone-600" />
                辨識／匯入團員名單 ({selectedMemberCount} / {preview.members.length} 位)
              </h5>
              {(preview.outboundFlight || preview.returnFlight) && (
                <span className="text-[11px] font-mono font-bold text-stone-500 inline-flex items-center gap-1">
                  <Plane className="w-3.5 h-3.5" />
                  {preview.outboundFlight || '-'} / {preview.returnFlight || '-'}
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {preview.members.map((member) => (
                <div
                  key={member.id}
                  className={cn(
                    'p-2.5 rounded-xl border bg-white grid grid-cols-1 sm:grid-cols-12 gap-2 items-center',
                    !member.selected && 'opacity-55 bg-stone-50'
                  )}
                >
                  <div className="sm:col-span-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={member.selected}
                      onChange={(e) =>
                        updateMemberItem(member.id, { selected: e.target.checked })
                      }
                      className="w-4 h-4 accent-stone-900 rounded cursor-pointer"
                      aria-label={`勾選團員 ${member.name}`}
                    />
                    <input
                      type="text"
                      value={member.name}
                      onChange={(e) =>
                        updateMemberItem(member.id, { name: e.target.value })
                      }
                      className="w-full px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 text-xs font-bold"
                    />
                  </div>
                  <div className="sm:col-span-4 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={member.outboundFlight}
                      onChange={(e) =>
                        updateMemberItem(member.id, { outboundFlight: e.target.value })
                      }
                      placeholder="去程航班"
                      className="w-1/2 px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 text-[11px] font-mono"
                    />
                    <input
                      type="text"
                      value={member.returnFlight}
                      onChange={(e) =>
                        updateMemberItem(member.id, { returnFlight: e.target.value })
                      }
                      placeholder="回程航班"
                      className="w-1/2 px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 text-[11px] font-mono"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      value={member.notes}
                      onChange={(e) =>
                        updateMemberItem(member.id, { notes: e.target.value })
                      }
                      placeholder="備註（例如提早集合、分組等）"
                      className="w-full px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 text-[11px] text-stone-600"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={addEmptyItem}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            新增一筆明細
          </button>

          <button
            type="submit"
            disabled={busy || (selectedCount === 0 && !showTripMeta)}
            className="flex-1 sm:flex-none px-6 py-3 rounded-2xl bg-stone-900 text-white text-sm font-bold shadow-lg hover:bg-stone-800 disabled:opacity-50 transition-all cursor-pointer"
          >
            {busy
              ? '正在寫入資料庫...'
              : showTripMeta && selectedMemberCount > 0
                ? `${submitLabelPrefix} (${selectedCount} 筆行程項目、${selectedMemberCount} 位團員)`
                : `${submitLabelPrefix} (${selectedCount} 筆行程項目)`}
          </button>
        </div>
      </form>
    );
  }

  // Upload & Source Input View
  return (
    <div className="space-y-4">
      {parseError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
          {parseError}
        </div>
      )}

      {/* Dropzone & Multi-file Upload */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-stone-300 hover:border-[#00F3FF] bg-stone-50/80 hover:bg-[#00F3FF]/5 rounded-2xl p-5 text-center cursor-pointer transition-all"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.xlsx,.xls,.csv,.txt,.md"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
        <Upload className="w-7 h-7 mx-auto text-stone-500 mb-2" />
        <p className="text-sm font-bold text-stone-800">
          點擊上傳企劃書、紙本行程表照片、PDF 或 Excel／CSV
        </p>
        <p className="text-[11px] text-stone-500 mt-1">
          支援 JPG / PNG / PDF / XLSX / CSV / TXT，可同時上傳多張紙本照片合併辨識
        </p>
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, idx) => (
            <span
              key={`${file.name}-${idx}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-bold"
            >
              <FileText className="w-3.5 h-3.5 text-[#00F3FF]" />
              <span className="max-w-[180px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveFile(idx)}
                className="p-0.5 rounded-full hover:bg-white/20"
                aria-label={`移除 ${file.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Raw Text / LINE Message Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-bold text-stone-700">
            或直接貼上行程企劃文字／LINE 群組公告
          </label>
          <button
            type="button"
            onClick={() => {
              setRawText(SAMPLE_PROPOSAL_TEXT);
              setAnchorStartDate('2026-11-20');
              setParseError(null);
            }}
            className="text-[11px] font-bold text-stone-600 hover:text-stone-900 underline underline-offset-4 cursor-pointer"
          >
            帶入範例企劃文字測試
          </button>
        </div>
        <textarea
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="例如：Day 1 08:30 桃園機場集合 -> 12:00 抵達札幌享用成吉思汗烤肉 -> 15:00 大通公園..."
          className="w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
        />
      </div>

      {showTripMeta && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-stone-400" />
            初始團員名單（選填，每行一位姓名，將自動帶入航班與行程備註）
          </label>
          <textarea
            rows={4}
            value={memberNamesText}
            onChange={(e) => setMemberNamesText(e.target.value)}
            placeholder={"例如：\n惠婷\n家綺\n翊嘉"}
            className="w-full px-4 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
          />
        </div>
      )}

      {/* Anchor Start Date & Optional API Key Toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        <div>
          <label className="text-[11px] font-bold text-stone-600 flex items-center gap-1.5 mb-1">
            <Calendar className="w-3.5 h-3.5 text-stone-400" />
            預設出發日期（若文件僅寫 Day 1 / Day 2）
          </label>
          <input
            type="date"
            value={anchorStartDate}
            onChange={(e) => setAnchorStartDate(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200 text-sm font-bold"
          />
        </div>

        <div className="pt-0 sm:pt-5">
          <button
            type="button"
            onClick={() => setShowApiKeyConfig((prev) => !prev)}
            className="w-full px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-xs font-bold text-stone-600 hover:text-stone-900 flex items-center justify-between cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-stone-400" />
              API 金鑰設定（選填，預設使用 Firebase AI）
            </span>
            {showApiKeyConfig ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {showApiKeyConfig && (
        <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            自訂 Gemini API Key（圖片／PDF 辨識建議填入，僅存於本機瀏覽器；TXT／CSV／Excel／貼上文字支援免金鑰解析）
          </label>
          <input
            type="password"
            value={customApiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            placeholder="AIza...（可至 aistudio.google.com/apikey 免費取得）"
            className="w-full px-3.5 py-2 rounded-xl bg-white border border-stone-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/40"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleStartParse}
        disabled={files.length === 0 && !rawText.trim()}
        className="spring-interactive w-full py-3.5 rounded-2xl bg-stone-900 text-white text-sm font-bold shadow-lg hover:bg-stone-800 disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
      >
        <Sparkles className="w-4 h-4 text-[#00F3FF]" />
        開始 AI 智慧辨識
      </button>
    </div>
  );
}
