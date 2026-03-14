import { config } from '../../config.js';

export interface GeocodeResult {
  lat: number | null;
  lng: number | null;
  formattedAddress?: string;
  error?: string;
}

interface KakaoAddressDocument {
  address_name: string;
  x: string; // lng
  y: string; // lat
}

interface KakaoAddressResponse {
  documents: KakaoAddressDocument[];
  meta: { total_count: number };
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!config.kakaoMapRestKey) {
    return { lat: null, lng: null, error: 'Kakao Map API 키가 설정되지 않았습니다' };
  }

  try {
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${config.kakaoMapRestKey}` },
    });

    if (!response.ok) {
      return { lat: null, lng: null, error: `Kakao API 오류: ${response.status}` };
    }

    const data = (await response.json()) as KakaoAddressResponse;

    if (!data.documents || data.documents.length === 0) {
      // 주소 검색 실패 시 키워드 검색으로 재시도
      return await geocodeByKeyword(address);
    }

    const doc = data.documents[0];
    return {
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      formattedAddress: doc.address_name,
    };
  } catch (err) {
    const isNetworkError = err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'));
    return {
      lat: null,
      lng: null,
      error: isNetworkError ? '주소 검색 서비스에 연결할 수 없습니다' : '주소를 찾을 수 없습니다',
    };
  }
}

interface KakaoKeywordDocument {
  place_name: string;
  road_address_name: string;
  address_name: string;
  x: string;
  y: string;
}

interface KakaoKeywordResponse {
  documents: KakaoKeywordDocument[];
  meta: { total_count: number };
}

async function geocodeByKeyword(address: string): Promise<GeocodeResult> {
  try {
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}`;
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${config.kakaoMapRestKey}` },
    });

    if (!response.ok) {
      return { lat: null, lng: null, error: '주소를 찾을 수 없습니다' };
    }

    const data = (await response.json()) as KakaoKeywordResponse;

    if (!data.documents || data.documents.length === 0) {
      return { lat: null, lng: null, error: '주소를 찾을 수 없습니다' };
    }

    const doc = data.documents[0];
    return {
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      formattedAddress: doc.road_address_name || doc.address_name || doc.place_name,
    };
  } catch (err) {
    const isNetworkError = err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'));
    return {
      lat: null,
      lng: null,
      error: isNetworkError ? '주소 검색 서비스에 연결할 수 없습니다' : '주소를 찾을 수 없습니다',
    };
  }
}
