import * as XLSX from 'xlsx';
import { addDays, differenceInDays, format, isValid, parseISO } from 'date-fns';
import { doc, Timestamp, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { app, db, tripCollection } from '../firebase';
import { ItineraryType } from '../types';

export const CUSTOM_GEMINI_KEY_STORAGE = 'grouptrip_custom_gemini_api_key';

export const SAMPLE_PROPOSAL_TEXT = `2026 北海道道央道南 5 天 4 夜團體旅遊企劃書

出發日期：2026-11-20 ~ 2026-11-24

Day 1 (11/20)：台北桃園 -> 新千歲機場 -> 支笏湖 -> 登別溫泉
- 06:30 桃園機場第二航廈長榮航空櫃檯集合報到（請攜帶護照正本）
- 09:30 搭乘 BR116 飛往新千歲機場（預計 14:15 抵達）
- 15:15 專車前往支笏湖散策（冰濤祭會場周邊自由活動）
- 18:00 飯店內享用北海道三大蟹自助晚餐（預算日幣 8,000 / 人，素食組另有懷石套餐）
- 20:00 入住登別第一瀧本館溫泉飯店（分房入住，可免費使用大浴場）

Day 2 (11/21)：地獄谷 -> 昭和新山熊牧場 -> 洞爺湖 -> 函館百萬夜景
- 08:30 登別地獄谷散步拍照
- 10:00 昭和新山與熊牧場（贈送每位團員蘋果飼料一袋）
- 12:15 洞爺湖景觀餐廳享用石狩鍋定食
- 14:30 專車南下前往函館（途中大沼國定公園休息）
- 17:30 搭乘函館山纜車欣賞世界三大夜景
- 19:30 函館國際飯店 Check-in 並享用港灣西式晚餐`;

export interface ParsedItineraryItem {
  id: string;
  selected: boolean;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm or ''
  title: string;
  type: ItineraryType;
  address: string;
  notes: string;
  isMain: boolean;
}

export interface ParsedMemberItem {
  id: string;
  selected: boolean;
  name: string;
  outboundFlight: string;
  outboundTime: string;
  returnFlight: string;
  returnTime: string;
  tripDays: number;
  notes: string;
}

export interface ParsedTripProposal {
  name: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  officialStartDate: string; // YYYY-MM-DD
  outboundFlight: string;
  outboundTime: string;
  returnFlight: string;
  returnTime: string;
  items: ParsedItineraryItem[];
  members: ParsedMemberItem[];
}

export interface ParseTripProposalParams {
  files?: File[];
  rawText?: string;
  memberNamesText?: string;
  defaultStartDate: string;
  customApiKey?: string;
}

const VALID_TYPES: ItineraryType[] = [
  'attraction',
  'dining',
  'transit',
  'logistics',
  'accommodation',
];

function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeIsoDate(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim().replace(/\//g, '-');
  const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return fallback;
  const yyyy = match[1];
  const mm = match[2].padStart(2, '0');
  const dd = match[3].padStart(2, '0');
  const iso = `${yyyy}-${mm}-${dd}`;
  const parsed = parseISO(iso);
  return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : fallback;
}

export function normalizeTimeString(raw: unknown, fallback = '09:00'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim().replace('：', ':');
  if (!cleaned) return fallback;
  const match = cleaned.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return fallback;
  const hh = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  if (isNaN(hh) || isNaN(min) || hh < 0 || hh > 23 || min < 0 || min > 59) {
    return fallback;
  }
  return `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function normalizeItineraryType(raw: unknown): ItineraryType {
  if (typeof raw === 'string') {
    const val = raw.trim().toLowerCase();
    if (VALID_TYPES.includes(val as ItineraryType)) {
      return val as ItineraryType;
    }
    if (val.includes('餐') || val.includes('食') || val.includes('吃') || val.includes('din')) {
      return 'dining';
    }
    if (val.includes('交') || val.includes('車') || val.includes('機') || val.includes('船') || val.includes('trans')) {
      return 'transit';
    }
    if (val.includes('宿') || val.includes('飯') || val.includes('住') || val.includes('hotel') || val.includes('accom')) {
      return 'accommodation';
    }
    if (val.includes('行') || val.includes('報') || val.includes('集') || val.includes('logis')) {
      return 'logistics';
    }
  }
  return 'attraction';
}

export function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const parsed = parseISO(dateStr);
  if (!isValid(parsed)) return dateStr;
  return format(addDays(parsed, deltaDays), 'yyyy-MM-dd');
}

type PromptPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`無法讀取檔案「${file.name}」`));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error(`無法編碼檔案「${file.name}」`));
        return;
      }
      resolve(result.slice(commaIdx + 1));
    };
    reader.readAsDataURL(file);
  });
}

async function fileToContentPart(file: File): Promise<PromptPart> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetsText = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return `--- 工作表: ${sheetName} ---\n${csv}`;
    }).join('\n\n');
    return { text: `【試算表檔案：${file.name}】\n${sheetsText}` };
  }

  if (
    file.type.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md')
  ) {
    const content = await file.text();
    return { text: `【文字檔案：${file.name}】\n${content}` };
  }

  const maxBytes = 18 * 1024 * 1024; // Keep under 20MB inlineData payload limit
  if (file.size > maxBytes) {
    throw new Error(`檔案「${file.name}」超過 18MB 上限，請壓縮後再上傳或貼上文字內容。`);
  }

  let mimeType = file.type;
  if (!mimeType) {
    if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (lowerName.endsWith('.png')) mimeType = 'image/png';
    else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';
    else if (lowerName.endsWith('.heic')) mimeType = 'image/heic';
    else mimeType = 'image/jpeg';
  }

  const data = await fileToBase64(file);
  return {
    inlineData: {
      data,
      mimeType,
    },
  };
}

function buildInstructionPrompt(
  defaultStartDate: string,
  extraText: string,
  memberNamesText: string
): string {
  const textBlock = extraText.trim()
    ? `\n\n使用者補充文字或企劃書內容：\n"""\n${extraText.trim()}\n"""`
    : '';
  const membersBlock = memberNamesText.trim()
    ? `\n\n使用者提供的本次團員名單（請務必每位都納入回傳的 members 陣列中，並比對企劃書是否有提到該成員的專屬備忘，例如計程車、分工、出發提醒等）：\n"""\n${memberNamesText.trim()}\n"""`
    : '';

  return `你是一位資深的繁體中文旅遊團控與行程企劃助手。
請仔細閱讀使用者上傳的圖片（可能是紙本行程表拍照、旅遊DM）、PDF企劃書、試算表或文字內容，擷取並結構化輸出完整的「旅遊團基本資訊」、「每日所有行程明細」與「團員名單航班設定」。

解析規則：
1. 請全部使用「繁體中文」輸出標題、簡介與備註（專有名詞保留原名即可）。
2. 請務必逐列完整擷取表格或企劃書中的【每一筆】行程與時段，不要合併、省略或跳過任何一天的任何列項目！若有金額費用（例如 ￥1000、￥3000以上）、集合地點、注意事項或備註欄位內容，請一併完整放進該筆行程的 notes。
3. 若文件有明確年份與日期，請直接換算為 YYYY-MM-DD；若只寫「Day 1 / 第一天」、「11/19 / 11/20」未寫年份或未寫確切日期，請參考出發基準日「${defaultStartDate}」所屬年份依序推算每一天的 YYYY-MM-DD 日期。
4. startDate 為行程第一天（含提早集合或值宿日），endDate 為行程最後一天（不得早於 startDate），officialStartDate 為正式出發或航班啟程日（若第 1 天只是前一天提早集合值宿、隔天才是正式搭機日，則填該隔天日期；否則等於 startDate）。
5. 每個活動都要推算出合理的開始時間 startTime（24小時制 HH:mm）。若紙本只寫「早上/上午/中午/下午/晚上/夜間」或該列空白時間（例如住宿、午餐、成人部發表），請依上下文前一筆與後一筆之間自動推算合理時間（例如 08:30、12:00、14:00、18:00、20:00、22:30）。endTime 若有寫區間（如 15:00~15:17）請填結束時間 HH:mm，否則填 ""。
6. type 只能是下列 5 種英文代碼之一：
   - "attraction"：觀光景點、參拜、活動發表、奉仕、座談、自由行、賞楓
   - "dining"：早/午/晚餐、餐廳、咖啡廳、便當
   - "transit"：航班、機場報到、はるか、JR、巴士、計程車移動
   - "accommodation"：飯店入住、住宿、研修棟住宿、支部就寢
   - "logistics"：起床、集合、交換淨靈、早拜、晚拜、洗澡休息、收費提醒
7. isMain：全團統一參加的主要行程填 true；若標記為自由行選配、分組不同活動（如僅部分人或自由行選項）可視情況填 false，一般主要團務填 true。
8. address 填寫地點或地址（若有寫總部地址/美術館地址或站名請帶入，沒提到填 ""）；notes 整理該時段費用與重要備註。
9. 請從文件擷取團隊的主要去程航班代碼與時間（outboundFlight 如 "IT210"、outboundTime 如 "2026-11-20 07:00"）及回程航班（returnFlight 如 "IT211"、returnTime 如 "2026-11-24 11:30"），沒提到則填 ""。
10. 若使用者有提供團員名單，請為每位團員填入 outboundFlight、outboundTime、returnFlight、returnTime、tripDays（旅遊總天數整數）與個人專屬 notes（例如企劃書若寫「4:00 出發拜拜：和生、文心坐計程車出發」，則文心這位的 notes 應標註「11/20 04:00 和生、文心坐計程車出發」）；若文件未寫團員名單也未提供，members 填 []。
11. 請務必只輸出合法 JSON 物件，不要包含 markdown 或額外文字。${textBlock}${membersBlock}`;
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  }
  return trimmed;
}

function normalizeParsedProposal(
  parsed: any,
  defaultStartDate: string,
  memberNamesText = ''
): ParsedTripProposal {
  const safeDefaultStart = normalizeIsoDate(defaultStartDate, format(new Date(), 'yyyy-MM-dd'));
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

  const items: ParsedItineraryItem[] = rawItems
    .filter((item: any) => item && typeof item.title === 'string' && item.title.trim().length > 0)
    .map((item: any) => {
      const date = normalizeIsoDate(item.date, safeDefaultStart);
      const startTime = normalizeTimeString(item.startTime, '09:00');
      const endTime = item.endTime ? normalizeTimeString(item.endTime, '') : '';
      return {
        id: createLocalId(),
        selected: true,
        date,
        startTime,
        endTime,
        title: String(item.title).trim().slice(0, 200),
        type: normalizeItineraryType(item.type),
        address: typeof item.address === 'string' ? item.address.trim().slice(0, 500) : '',
        notes: typeof item.notes === 'string' ? item.notes.trim().slice(0, 2000) : '',
        isMain: typeof item.isMain === 'boolean' ? item.isMain : true,
      };
    })
    .sort((a: ParsedItineraryItem, b: ParsedItineraryItem) => {
      return `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`);
    });

  const inferredStart = items.length > 0 ? items[0].date : safeDefaultStart;
  const inferredEnd = items.length > 0 ? items[items.length - 1].date : safeDefaultStart;

  const startDate = normalizeIsoDate(parsed?.startDate, inferredStart);
  let endDate = normalizeIsoDate(parsed?.endDate, inferredEnd);
  if (endDate < startDate) {
    endDate = items.length > 0 && items[items.length - 1].date >= startDate
      ? items[items.length - 1].date
      : startDate;
  }

  let officialStartDate = normalizeIsoDate(parsed?.officialStartDate, startDate);
  if (officialStartDate < startDate || officialStartDate > endDate) {
    officialStartDate = startDate;
  }

  const outboundFlight = typeof parsed?.outboundFlight === 'string' ? parsed.outboundFlight.trim().slice(0, 100) : '';
  const outboundTime = typeof parsed?.outboundTime === 'string' ? parsed.outboundTime.trim().slice(0, 100) : '';
  const returnFlight = typeof parsed?.returnFlight === 'string' ? parsed.returnFlight.trim().slice(0, 100) : '';
  const returnTime = typeof parsed?.returnTime === 'string' ? parsed.returnTime.trim().slice(0, 100) : '';

  const spanDays = differenceInDays(parseISO(endDate), parseISO(officialStartDate)) + 1;
  const defaultTripDays = Math.max(1, Math.min(365, isNaN(spanDays) ? 1 : spanDays));

  const rawMembers = Array.isArray(parsed?.members) ? parsed.members : [];
  const memberMap = new Map<string, ParsedMemberItem>();

  for (const m of rawMembers) {
    if (!m || typeof m.name !== 'string' || !m.name.trim()) continue;
    const cleanName = m.name.trim().slice(0, 100);
    const parsedDays = typeof m.tripDays === 'number' && m.tripDays >= 1 && m.tripDays <= 365
      ? Math.round(m.tripDays)
      : defaultTripDays;
    memberMap.set(cleanName, {
      id: createLocalId(),
      selected: true,
      name: cleanName,
      outboundFlight: (typeof m.outboundFlight === 'string' ? m.outboundFlight.trim() : '') || outboundFlight,
      outboundTime: (typeof m.outboundTime === 'string' ? m.outboundTime.trim() : '') || outboundTime,
      returnFlight: (typeof m.returnFlight === 'string' ? m.returnFlight.trim() : '') || returnFlight,
      returnTime: (typeof m.returnTime === 'string' ? m.returnTime.trim() : '') || returnTime,
      tripDays: parsedDays,
      notes: typeof m.notes === 'string' ? m.notes.trim().slice(0, 2000) : '',
    });
  }

  // Ensure every explicitly listed name is present even if the model missed one
  const inputNames = memberNamesText
    .split(/[\r\n,，、]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const rawName of inputNames) {
    const cleanName = rawName.slice(0, 100);
    if (!memberMap.has(cleanName)) {
      memberMap.set(cleanName, {
        id: createLocalId(),
        selected: true,
        name: cleanName,
        outboundFlight,
        outboundTime,
        returnFlight,
        returnTime,
        tripDays: defaultTripDays,
        notes: '',
      });
    }
  }

  return {
    name:
      typeof parsed?.name === 'string' && parsed.name.trim()
        ? parsed.name.trim().slice(0, 120)
        : 'AI 辨識新旅遊行程',
    description:
      typeof parsed?.description === 'string'
        ? parsed.description.trim().slice(0, 500)
        : '',
    startDate,
    endDate,
    officialStartDate,
    outboundFlight,
    outboundTime,
    returnFlight,
    returnTime,
    items,
    members: Array.from(memberMap.values()),
  };
}

async function runWithFirebaseAI(
  parts: PromptPart[],
  backendType: 'googleai' | 'vertexai' = 'googleai'
): Promise<string> {
  const { getAI, getGenerativeModel, GoogleAIBackend, VertexAIBackend, Schema } = await import('firebase/ai');
  const backend = backendType === 'vertexai' ? new VertexAIBackend('us-central1') : new GoogleAIBackend();
  const ai = getAI(app, { backend });

  const responseSchema = Schema.object({
    properties: {
      name: Schema.string(),
      description: Schema.string(),
      startDate: Schema.string(),
      endDate: Schema.string(),
      officialStartDate: Schema.string(),
      outboundFlight: Schema.string(),
      outboundTime: Schema.string(),
      returnFlight: Schema.string(),
      returnTime: Schema.string(),
      items: Schema.array({
        items: Schema.object({
          properties: {
            date: Schema.string(),
            startTime: Schema.string(),
            endTime: Schema.string(),
            title: Schema.string(),
            type: Schema.enumString({ enum: VALID_TYPES }),
            address: Schema.string(),
            notes: Schema.string(),
            isMain: Schema.boolean(),
          },
        }),
      }),
      members: Schema.array({
        items: Schema.object({
          properties: {
            name: Schema.string(),
            outboundFlight: Schema.string(),
            outboundTime: Schema.string(),
            returnFlight: Schema.string(),
            returnTime: Schema.string(),
            tripDays: Schema.integer(),
            notes: Schema.string(),
          },
        }),
      }),
    },
  });

  const model = getGenerativeModel(ai, {
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0.2,
      maxOutputTokens: 16384,
    },
  });

  const result = await model.generateContent(parts);
  return result.response.text();
}

async function runWithGoogleGenAI(parts: PromptPart[], apiKey: string): Promise<string> {
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: 16384,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          startDate: { type: Type.STRING },
          endDate: { type: Type.STRING },
          officialStartDate: { type: Type.STRING },
          outboundFlight: { type: Type.STRING },
          outboundTime: { type: Type.STRING },
          returnFlight: { type: Type.STRING },
          returnTime: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                startTime: { type: Type.STRING },
                endTime: { type: Type.STRING },
                title: { type: Type.STRING },
                type: {
                  type: Type.STRING,
                  enum: VALID_TYPES,
                },
                address: { type: Type.STRING },
                notes: { type: Type.STRING },
                isMain: { type: Type.BOOLEAN },
              },
              required: ['date', 'startTime', 'title', 'type', 'isMain'],
            },
          },
          members: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                outboundFlight: { type: Type.STRING },
                outboundTime: { type: Type.STRING },
                returnFlight: { type: Type.STRING },
                returnTime: { type: Type.STRING },
                tripDays: { type: Type.INTEGER },
                notes: { type: Type.STRING },
              },
              required: ['name'],
            },
          },
        },
        required: ['name', 'startDate', 'endDate', 'items'],
      },
    },
  });

  return response.text || '';
}

function inferTypeFromTitle(title: string): ItineraryType {
  const t = title.toLowerCase();
  if (/住宿|就寢|飯店|旅館|check-in|值宿/.test(t)) return 'accommodation';
  if (/早餐|午餐|晚餐|咖啡廳|便當|餐廳|定食|下午茶/.test(t)) return 'dining';
  if (/虎航|航空|機場|はるか|haruka|jr|巴士|計程車|車站|飛往|前往台灣|出發日本|往蹴上|往京都|往守山|往南草津|往滋賀|到達台北/.test(t)) return 'transit';
  if (/起床|集合|就座|洗澡|休息|交換淨靈|早拜|晚拜|出發拜拜|打掃/.test(t)) return 'logistics';
  return 'attraction';
}

function inferAddressFromText(title: string, notes: string): string {
  const combined = `${title} ${notes}`;
  if (/美術館/.test(combined)) return '滋賀県甲賀市信楽町桃谷 (MIHO美術館)';
  if (/教祖殿|研修棟|宗務棟|梅園|總部/.test(combined)) return '滋賀県甲賀市信楽町神楽苑2 (神慈秀明會總部)';
  if (/關西國際機場|關西機場/.test(combined)) return '關西國際機場 (KIX)';
  if (/桃園機場/.test(combined)) return '台灣桃園國際機場';
  if (/京都車站/.test(combined)) return 'JR 京都車站';
  if (/南草津/.test(combined)) return 'JR 南草津站';
  if (/守山/.test(combined)) return 'JR 守山站';
  if (/滋賀支部/.test(combined)) return '滋賀支部';
  if (/京都支部/.test(combined)) return '京都支部';
  if (/東寺/.test(combined)) return '京都東寺';
  if (/山本農園/.test(combined)) return '山本農園';
  return '';
}

function addMinutesToTime(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (isNaN(h) || isNaN(m)) return '09:00';
  const total = Math.min(23 * 60 + 55, h * 60 + m + mins);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function parseProposalLocally(
  combinedText: string,
  defaultStartDate: string,
  memberNamesText: string
): ParsedTripProposal {
  const safeDefaultStart = normalizeIsoDate(defaultStartDate, format(new Date(), 'yyyy-MM-dd'));
  const baseYearMatch = combinedText.match(/\b(20\d{2})\b/);
  const baseYear = baseYearMatch ? baseYearMatch[1] : safeDefaultStart.slice(0, 4);

  const lines = combinedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Infer title from first meaningful line
  let tripName = '新旅遊行程';
  for (const line of lines) {
    if (line.startsWith('【') || line.startsWith('---') || line.startsWith('日期')) continue;
    tripName = line.replace(/\/預估費用明細|行程表.*$/g, '').trim() || line.slice(0, 60);
    break;
  }

  let currentDate = safeDefaultStart;
  let lastTimeForDate: Record<string, string> = {};
  const items: ParsedItineraryItem[] = [];
  const flightMatches: { code: string; date: string; time: string }[] = [];
  const summaryLines: string[] = [];

  for (const rawLine of lines) {
    if (
      rawLine.startsWith('【') ||
      rawLine.startsWith('---') ||
      /^日期\s*[|,\t]/.test(rawLine)
    ) {
      continue;
    }

    // Collect budget/contact summary lines
    if (/^(合計|預估費用|另外加購|\d+\.\s*攜帶物品|\d+\.\s*聯絡方式|神慈秀明會總部|MIHO美術館|岡田老師|松下佳代)/.test(rawLine)) {
      summaryLines.push(rawLine);
      continue;
    }

    // Day heading without pipe (e.g., "Day 1 (11/20)：..." or "11/20(五)")
    const dayHeaderMatch = rawLine.match(/^Day\s*(\d+).*?(?:(\d{1,2})\/(\d{1,2}))?/i);
    if (dayHeaderMatch && !rawLine.includes('|')) {
      if (dayHeaderMatch[2] && dayHeaderMatch[3]) {
        currentDate = normalizeIsoDate(
          `${baseYear}-${dayHeaderMatch[2]}-${dayHeaderMatch[3]}`,
          currentDate
        );
      } else {
        const dayOffset = Math.max(0, parseInt(dayHeaderMatch[1], 10) - 1);
        currentDate = shiftIsoDate(safeDefaultStart, dayOffset);
      }
      continue;
    }

    // Pipe-delimited table row: 日期 | 時間 | 行程內容 | 費用 | 備註
    if (rawLine.includes('|')) {
      const cols = rawLine.split('|').map((c) => c.trim());
      if (cols.length >= 3) {
        const [dateCol, timeCol, contentCol, costCol = '', noteCol = ''] = cols;
        if (!contentCol || contentCol === '行程內容') continue;

        const mdMatch = dateCol.match(/(\d{1,2})\/(\d{1,2})/);
        if (mdMatch) {
          currentDate = normalizeIsoDate(
            `${baseYear}-${mdMatch[1]}-${mdMatch[2]}`,
            currentDate
          );
        }

        let startTime = '';
        let endTime = '';
        const rangeMatch = timeCol.match(/(\d{1,2}:\d{2})\s*[~～→\-]\s*(\d{1,2}:\d{2})/);
        const singleMatch = timeCol.match(/(\d{1,2}:\d{2})/);
        if (rangeMatch) {
          startTime = normalizeTimeString(rangeMatch[1], '09:00');
          endTime = normalizeTimeString(rangeMatch[2], '');
        } else if (singleMatch) {
          startTime = normalizeTimeString(singleMatch[1], '09:00');
        } else {
          // Infer time from title or previous item on same date
          const contentRange = contentCol.match(/(\d{1,2}:\d{2})\s*[~～→\-]\s*(\d{1,2}:\d{2})/);
          if (contentRange) {
            startTime = normalizeTimeString(contentRange[1], '09:00');
            endTime = normalizeTimeString(contentRange[2], '');
          } else if (/住宿|就寢/.test(contentCol)) {
            startTime = '22:30';
          } else if (/午餐/.test(contentCol)) {
            startTime = '12:00';
          } else if (lastTimeForDate[currentDate]) {
            startTime = addMinutesToTime(lastTimeForDate[currentDate], 20);
          } else {
            startTime = '09:00';
          }
        }

        lastTimeForDate[currentDate] = endTime || startTime;

        const noteParts: string[] = [];
        if (costCol) noteParts.push(`費用：${costCol}`);
        if (noteCol) noteParts.push(noteCol);
        const notes = noteParts.join('｜').slice(0, 2000);

        const flightRegex = /\b([A-Z]{2}\d{2,4})\b/g;
        let fm: RegExpExecArray | null;
        while ((fm = flightRegex.exec(`${contentCol} ${noteCol}`)) !== null) {
          flightMatches.push({ code: fm[1], date: currentDate, time: startTime });
        }

        items.push({
          id: createLocalId(),
          selected: true,
          date: currentDate,
          startTime,
          endTime,
          title: contentCol.slice(0, 200),
          type: inferTypeFromTitle(contentCol),
          address: inferAddressFromText(contentCol, notes),
          notes,
          isMain: !/自由行|自行決定/.test(`${contentCol} ${noteCol}`),
        });
        continue;
      }
    }

    // Bulleted or time-prefixed line: "- 08:30 登別地獄谷..."
    const bulletMatch = rawLine.match(/^[-*•]?\s*(\d{1,2}:\d{2})(?:\s*[~～\-]\s*(\d{1,2}:\d{2}))?\s+(.+)$/);
    if (bulletMatch) {
      const startTime = normalizeTimeString(bulletMatch[1], '09:00');
      const endTime = bulletMatch[2] ? normalizeTimeString(bulletMatch[2], '') : '';
      const content = bulletMatch[3].trim();
      lastTimeForDate[currentDate] = endTime || startTime;

      const flightRegex = /\b([A-Z]{2}\d{2,4})\b/g;
      let fm: RegExpExecArray | null;
      while ((fm = flightRegex.exec(content)) !== null) {
        flightMatches.push({ code: fm[1], date: currentDate, time: startTime });
      }

      items.push({
        id: createLocalId(),
        selected: true,
        date: currentDate,
        startTime,
        endTime,
        title: content.slice(0, 200),
        type: inferTypeFromTitle(content),
        address: inferAddressFromText(content, ''),
        notes: '',
        isMain: true,
      });
    }
  }

  items.sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));

  const startDate = items.length > 0 ? items[0].date : safeDefaultStart;
  const endDate = items.length > 0 ? items[items.length - 1].date : safeDefaultStart;

  const outbound = flightMatches[0];
  const ret = flightMatches.length > 1 ? flightMatches[flightMatches.length - 1] : undefined;

  let officialStartDate = startDate;
  if (outbound && outbound.date > startDate && outbound.date <= endDate) {
    officialStartDate = outbound.date;
  }

  const outboundFlight = outbound?.code || '';
  const outboundTime = outbound ? `${outbound.date} ${outbound.time}` : '';
  const returnFlight = ret?.code || '';
  const returnTime = ret ? `${ret.date} ${ret.time}` : '';

  const spanDays = differenceInDays(parseISO(endDate), parseISO(officialStartDate)) + 1;
  const defaultTripDays = Math.max(1, Math.min(365, isNaN(spanDays) ? 1 : spanDays));

  const memberNames = memberNamesText
    .split(/[\r\n,，、]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const uniqueNames = Array.from(new Set(memberNames));
  const members: ParsedMemberItem[] = uniqueNames.map((name) => {
    const relatedNotes = items
      .filter((it) => it.notes.includes(name) || it.title.includes(name))
      .map((it) => `${it.date.slice(5)} ${it.startTime} ${it.title}（${it.notes || it.title}）`);

    return {
      id: createLocalId(),
      selected: true,
      name: name.slice(0, 100),
      outboundFlight,
      outboundTime,
      returnFlight,
      returnTime,
      tripDays: defaultTripDays,
      notes: relatedNotes.join('；').slice(0, 2000),
    };
  });

  const description = summaryLines.length > 0
    ? summaryLines.slice(0, 4).join('｜').slice(0, 500)
    : `${startDate} ~ ${endDate} 共 ${items.length} 項行程安排`;

  return {
    name: tripName.slice(0, 120),
    description,
    startDate,
    endDate,
    officialStartDate,
    outboundFlight,
    outboundTime,
    returnFlight,
    returnTime,
    items,
    members,
  };
}

export async function parseTripProposalWithAI({
  files = [],
  rawText = '',
  memberNamesText = '',
  defaultStartDate,
  customApiKey,
}: ParseTripProposalParams): Promise<ParsedTripProposal> {
  if (files.length === 0 && !rawText.trim()) {
    throw new Error('請上傳企劃書、紙本照片，或貼上行程文字內容後再開始辨識。');
  }

  const fileParts = await Promise.all(files.map((file) => fileToContentPart(file)));
  const hasBinaryMedia = fileParts.some((p) => 'inlineData' in p);
  const promptText = buildInstructionPrompt(defaultStartDate, rawText, memberNamesText);
  const parts: PromptPart[] = [{ text: promptText }, ...fileParts];

  const storedKey =
    typeof window !== 'undefined'
      ? localStorage.getItem(CUSTOM_GEMINI_KEY_STORAGE) || ''
      : '';
  const explicitKey = (customApiKey ?? storedKey).trim();

  let rawResponseText = '';
  if (explicitKey) {
    rawResponseText = await runWithGoogleGenAI(parts, explicitKey);
  } else {
    try {
      rawResponseText = await runWithFirebaseAI(parts, 'googleai');
    } catch (googleAiErr: any) {
      try {
        rawResponseText = await runWithFirebaseAI(parts, 'vertexai');
      } catch (vertexAiErr: any) {
        try {
          rawResponseText = await runWithGoogleGenAI(parts, firebaseConfig.apiKey);
        } catch (genAiErr: any) {
          // If all inputs are text/spreadsheet (no image/PDF binary), gracefully run built-in structured schedule parser
          if (!hasBinaryMedia) {
            const mergedText = [
              rawText.trim(),
              ...fileParts
                .filter((p): p is { text: string } => 'text' in p)
                .map((p) => p.text),
            ]
              .filter(Boolean)
              .join('\n\n');
            const localResult = parseProposalLocally(
              mergedText,
              defaultStartDate,
              memberNamesText
            );
            if (localResult.items.length > 0) {
              return localResult;
            }
          }

          const reason =
            genAiErr?.message ||
            vertexAiErr?.message ||
            googleAiErr?.message ||
            '未知錯誤';
          throw new Error(
            `Gemini AI 辨識需要專屬 API 金鑰（Google Cloud 規定 Gemini API 無法共用 Firebase Browser Key；原始錯誤：${reason}）。請至 Google AI Studio (aistudio.google.com/apikey) 取得免費金鑰並貼入下方「API 金鑰設定」，或改上傳 TXT／CSV／Excel／貼上文字進行免金鑰智慧解析。`
          );
        }
      }
    }
  }

  const jsonStr = extractJsonText(rawResponseText);
  if (!jsonStr) {
    throw new Error('AI 未回傳可解析的 JSON 內容，請確認文件清楚度後重試。');
  }

  let parsedJson: any;
  try {
    parsedJson = JSON.parse(jsonStr);
  } catch {
    throw new Error('AI 回傳格式無法解析為 JSON，請重新嘗試辨識。');
  }

  const normalized = normalizeParsedProposal(parsedJson, defaultStartDate, memberNamesText);
  if (normalized.items.length === 0) {
    throw new Error('未能從內容中辨識出任何行程項目，請提供更明確的文字或清晰圖片。');
  }
  return normalized;
}

export async function commitParsedItinerariesToTrip(
  tripId: string,
  anchorStartDate: string,
  items: ParsedItineraryItem[]
): Promise<number> {
  const selected = items.filter((item) => item.selected && item.title.trim().length > 0);
  if (selected.length === 0) return 0;

  const anchorParsed = parseISO(normalizeIsoDate(anchorStartDate, selected[0].date));
  const chunkSize = 400;

  for (let i = 0; i < selected.length; i += chunkSize) {
    const batch = writeBatch(db);
    const slice = selected.slice(i, i + chunkSize);

    slice.forEach((item) => {
      const startTimeStr = normalizeTimeString(item.startTime, '09:00');
      const itemDateStr = normalizeIsoDate(item.date, format(anchorParsed, 'yyyy-MM-dd'));
      const startDateObj = new Date(`${itemDateStr}T${startTimeStr}:00`);
      const validStart = isValid(startDateObj) ? startDateObj : new Date();

      let endTimestamp: Timestamp | null = null;
      if (item.endTime && item.endTime.trim()) {
        const endTimeStr = normalizeTimeString(item.endTime, '');
        if (endTimeStr) {
          const endDateObj = new Date(`${itemDateStr}T${endTimeStr}:00`);
          if (isValid(endDateObj)) {
            endTimestamp = Timestamp.fromDate(endDateObj);
          }
        }
      }

      const rawDayDiff = differenceInDays(parseISO(itemDateStr), anchorParsed);
      const dayIndex = isNaN(rawDayDiff)
        ? 0
        : Math.max(-1, Math.min(365, rawDayDiff));

      const newRef = doc(tripCollection('itineraries', tripId));
      batch.set(newRef, {
        id: newRef.id,
        title: item.title.trim().slice(0, 200),
        type: normalizeItineraryType(item.type),
        location: {
          address: (item.address || '').trim().slice(0, 500),
          navLink: '',
        },
        notes: (item.notes || '').trim().slice(0, 2000),
        isMain: item.isMain !== false,
        startTime: Timestamp.fromDate(validStart),
        endTime: endTimestamp,
        assignedMemberIds: [],
        excludedMemberIds: [],
        dayIndex,
        vehicleAssignments: {},
        isMultiVehicle: false,
        roomAssignments: {},
        isMultiRoom: false,
        rooms: [],
      });
    });

    await batch.commit();
  }

  return selected.length;
}

export async function commitParsedMembersToTrip(
  tripId: string,
  members: ParsedMemberItem[]
): Promise<number> {
  const selected = members.filter((m) => m.selected && m.name.trim().length > 0);
  if (selected.length === 0) return 0;

  const chunkSize = 400;
  for (let i = 0; i < selected.length; i += chunkSize) {
    const batch = writeBatch(db);
    const slice = selected.slice(i, i + chunkSize);

    slice.forEach((m) => {
      const newRef = doc(tripCollection('members', tripId));
      const days =
        typeof m.tripDays === 'number' && !isNaN(m.tripDays) && m.tripDays >= 0
          ? Math.min(1000, Math.round(m.tripDays))
          : 5;

      batch.set(newRef, {
        id: newRef.id,
        name: m.name.trim().slice(0, 100),
        dietaryHabits: '',
        phone: '',
        passportInfo: '',
        notes: (m.notes || '').trim().slice(0, 2000),
        groupId: '',
        tags: [],
        outboundFlight: (m.outboundFlight || '').trim().slice(0, 100),
        outboundTime: (m.outboundTime || '').trim().slice(0, 100),
        returnFlight: (m.returnFlight || '').trim().slice(0, 100),
        returnTime: (m.returnTime || '').trim().slice(0, 100),
        isLeader: false,
        gender: '',
        tripDays: days,
        carNumber: '',
      });
    });

    await batch.commit();
  }

  return selected.length;
}
