/*
 * 한국천문연구원 특일 정보 API → Firestore holidays 동기화.
 * 실행 환경 변수:
 *   KASI_HOLIDAY_API_KEY       공공데이터포털 일반 인증키(Decoding)
 *   FIREBASE_SERVICE_ACCOUNT   Firebase 서비스 계정 JSON 전체
 *   HOLIDAY_SYNC_YEARS         선택. 예: "2026,2027"
 */

const crypto = require('crypto');

const KASI_ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';
const HOLIDAY_FORECAST_ENDPOINT = 'https://nagerholidays.com/api/v4/Holidays';
const FORECAST_KOREAN_NAMES = {
  "New Year's Day": '신정', 'Lunar New Year': '설날', 'Independence Movement Day': '삼일절',
  'Labour Day': '근로자의 날', "Children's Day": '어린이날', "Buddha's Birthday": '부처님오신날',
  'Memorial Day': '현충일', 'Constitution Day': '제헌절', 'Liberation Day': '광복절',
  'Chuseok': '추석', 'National Foundation Day': '개천절', 'Hangul Day': '한글날', 'Christmas Day': '성탄절'
};
const FIRESTORE_ROOT = 'https://firestore.googleapis.com/v1/projects';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경 변수가 없습니다.`);
  return value;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function parseServiceAccount() {
  try {
    return JSON.parse(required('FIREBASE_SERVICE_ACCOUNT'));
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT JSON을 읽지 못했습니다: ${error.message}`);
  }
}

async function serviceAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${payload}.${signature}`
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google 인증 실패 (${response.status}): ${data.error_description || data.error || '알 수 없는 오류'}`);
  return data.access_token;
}

function yearsToSync() {
  const configured = (process.env.HOLIDAY_SYNC_YEARS || '')
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isInteger(value) && value >= 2000 && value <= 2100);
  if (configured.length) return [...new Set(configured)];
  const year = new Date().getFullYear();
  return [year, year + 1];
}

function toDateKey(locdate) {
  const value = String(locdate || '');
  if (!/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

async function fetchHolidays(year, apiKey) {
  const url = new URL(KASI_ENDPOINT);
  url.search = new URLSearchParams({
    serviceKey: apiKey,
    solYear: String(year),
    numOfRows: '100',
    _type: 'json'
  }).toString();
  const response = await fetch(url);
  const data = await response.json().catch(() => null);
  const header = data?.response?.header;
  if (!response.ok || header?.resultCode !== '00') {
    throw new Error(`공휴일 API 조회 실패 (${year}년): ${header?.resultMsg || response.status}`);
  }
  const rawItems = data?.response?.body?.items?.item || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items
    .filter(item => String(item.isHoliday || '').toUpperCase() === 'Y')
    .map(item => ({ date: toDateKey(item.locdate), name: String(item.dateName || '법정공휴일').trim(), source: 'kasi' }))
    .filter(item => item.date);
}

// 다음 연도처럼 공식 특일 API가 아직 공개하지 않은 구간은 예비 휴일 데이터로 채웁니다.
// 공식 API가 제공되기 시작하면 같은 날짜 문서를 다시 저장해 source: kasi로 덮어씁니다.
async function fetchForecastHolidays(year) {
  const response = await fetch(`${HOLIDAY_FORECAST_ENDPOINT}/KR/${year}`);
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data)) throw new Error(`예비 공휴일 API 조회 실패 (${year}년): ${response.status}`);
  return data
    .filter(item => item?.date && item.nationalHoliday !== false && (!Array.isArray(item.holidayTypes) || item.holidayTypes.includes('Public')))
    .map(item => ({ date: String(item.date), name: FORECAST_KOREAN_NAMES[item.name] || String(item.name || '법정공휴일').trim(), source: 'forecast' }))
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
}

async function fetchYearHolidays(year, apiKey) {
  try {
    return await fetchHolidays(year, apiKey);
  } catch (error) {
    // API 키 승인 지연·잘못된 키·미공개 다음 연도 등으로 공식 조회가 실패해도
    // 일정 화면의 휴일 계산은 멈추지 않도록 예비 데이터로 계속 진행합니다.
    console.warn(`${year}년 공식 공휴일을 조회하지 못해 예비 데이터로 반영합니다. (${error.message})`);
    return fetchForecastHolidays(year);
  }
}

async function upsertHoliday(projectId, token, holiday) {
  const url = `${FIRESTORE_ROOT}/${projectId}/databases/(default)/documents/holidays/${holiday.date}`;
  const body = {
    fields: {
      date: { stringValue: holiday.date },
      name: { stringValue: holiday.name },
      source: { stringValue: holiday.source || 'kasi' },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  };
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${holiday.date} Firestore 저장 실패 (${response.status}): ${text}`);
  }
}

async function main() {
  const apiKey = required('KASI_HOLIDAY_API_KEY');
  const serviceAccount = parseServiceAccount();
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) throw new Error('서비스 계정 JSON에 필수 값이 없습니다.');
  const holidays = (await Promise.all(yearsToSync().map(year => fetchYearHolidays(year, apiKey)))).flat();
  const unique = [...new Map(holidays.map(item => [item.date, item])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const token = await serviceAccessToken(serviceAccount);
  for (const holiday of unique) await upsertHoliday(serviceAccount.project_id, token, holiday);
  console.log(`공휴일 동기화 완료: ${unique.length}건 (${yearsToSync().join(', ')}년)`);
  unique.forEach(item => console.log(`${item.date} · ${item.name}`));
}

main().catch(error => {
  console.error(`공휴일 동기화 실패: ${error.message}`);
  process.exit(1);
});

