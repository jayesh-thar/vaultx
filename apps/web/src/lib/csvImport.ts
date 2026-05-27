export interface ParsedItem {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
}

type Format =
  | 'chrome'
  | 'lastpass'
  | 'bitwarden'
  | 'firefox'
  | '1password'
  | 'generic';

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function detect(headers: string[]): Format {
  const h = headers.map((s) => s.toLowerCase());
  if (h.some((x) => x.includes('grouping'))) return 'lastpass';
  if (h.some((x) => x.includes('login_password'))) return 'bitwarden';
  if (h.some((x) => x.includes('httprealm'))) return 'firefox';
  if (h.some((x) => x.includes('otpauth'))) return '1password';
  if (
    h.includes('name') &&
    h.includes('url') &&
    h.includes('username') &&
    h.includes('password')
  )
    return 'chrome';
  return 'generic';
}

export function parseCSV(text: string): {
  items: ParsedItem[];
  format: Format;
  total: number;
} {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim());
  if (lines.length < 2) return { items: [], format: 'generic', total: 0 };

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.replace(/['"]/g, '').toLowerCase().trim()
  );
  const format = detect(headers);

  const col = (row: string[], key: string): string => {
    const idx = headers.indexOf(key);
    return idx === -1
      ? ''
      : (row[idx] ?? '').replace(/^["']|["']$/g, '').trim();
  };

  const items = lines
    .slice(1)
    .map((line) => {
      const row = parseCSVLine(line);
      switch (format) {
        case 'chrome':
          return {
            title: col(row, 'name'),
            username: col(row, 'username'),
            password: col(row, 'password'),
            url: col(row, 'url'),
            notes: '',
          };
        case 'lastpass':
          return {
            title: col(row, 'name'),
            username: col(row, 'username'),
            password: col(row, 'password'),
            url: col(row, 'url'),
            notes: col(row, 'extra'),
          };
        case 'bitwarden':
          return {
            title: col(row, 'name'),
            username: col(row, 'login_username'),
            password: col(row, 'login_password'),
            url: col(row, 'login_uri'),
            notes: col(row, 'notes'),
          };
        case 'firefox':
          return {
            title: new URL(col(row, 'url')).hostname || col(row, 'url'),
            username: col(row, 'username'),
            password: col(row, 'password'),
            url: col(row, 'url'),
            notes: '',
          };
        case '1password':
          return {
            title: col(row, 'title'),
            username: col(row, 'username'),
            password: col(row, 'password'),
            url: col(row, 'url'),
            notes: col(row, 'notes'),
          };
        default:
          return {
            title:
              col(row, 'name') ||
              col(row, 'title') ||
              col(row, 'site') ||
              'Untitled',
            username:
              col(row, 'username') ||
              col(row, 'login') ||
              col(row, 'email') ||
              '',
            password: col(row, 'password') || col(row, 'pass') || '',
            url: col(row, 'url') || col(row, 'website') || '',
            notes: col(row, 'notes') || col(row, 'extra') || '',
          };
      }
    })
    .filter((item) => item.password);

  return { items, format, total: items.length };
}
