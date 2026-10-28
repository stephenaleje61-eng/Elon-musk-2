export const GLOBAL_INNOVATION_HUBS: readonly string[] = [
  'Austin, TX, USA',
  'Starbase, TX, USA',
  'Palo Alto, CA, USA',
  'Los Angeles, CA, USA',
  'New York, NY, USA',
  'Miami, FL, USA',
  'Sydney, NSW, Australia',
  'Melbourne, VIC, Australia',
  'Brisbane, QLD, Australia',
  'Perth, WA, Australia',
  'London, United Kingdom',
  'Toronto, ON, Canada',
  'Zurich, Switzerland',
  'Tokyo, Japan',
  'Singapore',
];

const EXCLUDED_LOCATION_PATTERNS = /nigeria|lagos|abuja|kano|ibadan|port harcourt|benin city|africa\/lagos|\bng\b|africa/i;

/**
 * Ensures any location string is a clean, professional US, Australian, or global hub
 * and never displays excluded regions.
 */
export function normalizeLocationHub(rawLocation: string, seed = ''): string {
  const trimmed = (rawLocation || '').trim();
  if (!trimmed || trimmed === 'Detecting location...' || EXCLUDED_LOCATION_PATTERNS.test(trimmed)) {
    let hash = 0;
    const key = seed || 'default_hub';
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    // Weight heavily toward American and Australian hubs as requested
    const preferredPool = [
      'Austin, TX, USA',
      'Sydney, NSW, Australia',
      'Los Angeles, CA, USA',
      'Melbourne, VIC, Australia',
      'New York, NY, USA',
      'Miami, FL, USA',
      'Brisbane, QLD, Australia',
      'Palo Alto, CA, USA',
      'London, United Kingdom',
      'Toronto, ON, Canada',
    ];
    return preferredPool[hash % preferredPool.length];
  }
  return trimmed;
}

/**
 * Automatic visitor location detection prioritizing US, Australia, and global hubs.
 */
export async function detectVisitorLocation(): Promise<string> {
  const sessionSeed =
    typeof window !== 'undefined'
      ? localStorage.getItem('elon_musk_space_visitor_id_v1') || String(Date.now())
      : 'austin';

  // Primary: ipwho.is
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://ipwho.is/', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success !== false && data.city) {
        const countryCode = String(data.country_code || '').toUpperCase();
        const countryName = String(data.country || '');
        const rawCombined = `${data.city}, ${data.region_code || data.region || ''}, ${countryName}`;

        if (EXCLUDED_LOCATION_PATTERNS.test(rawCombined) || countryCode === 'NG') {
          return normalizeLocationHub('', sessionSeed);
        }

        if (countryCode === 'US') {
          return `${data.city}, ${data.region_code || data.region || 'TX'}, USA`;
        }
        if (countryCode === 'AU') {
          return `${data.city}, ${data.region_code || data.region || 'NSW'}, Australia`;
        }
        return [data.city, data.region_code || data.region, countryName]
          .filter(Boolean)
          .join(', ');
      }
    }
  } catch {
    // Continue to secondary provider
  }

  // Secondary: ipapi.co
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.city) {
        const countryCode = String(data.country_code || '').toUpperCase();
        const countryName = String(data.country_name || '');
        const rawCombined = `${data.city}, ${data.region_code || ''}, ${countryName}`;

        if (EXCLUDED_LOCATION_PATTERNS.test(rawCombined) || countryCode === 'NG') {
          return normalizeLocationHub('', sessionSeed);
        }

        if (countryCode === 'US') {
          return `${data.city}, ${data.region_code || 'TX'}, USA`;
        }
        if (countryCode === 'AU') {
          return `${data.city}, ${data.region_code || 'NSW'}, Australia`;
        }
        return [data.city, countryName || countryCode].filter(Boolean).join(', ');
      }
    }
  } catch {
    // Fallback to clean hub resolution
  }

  return normalizeLocationHub('', sessionSeed);
}
