const URL_COLUMNS = ["url", "login_uri", "website", "origin"];
const USERNAME_COLUMNS = ["username", "login_username", "user", "email"];
const PASSWORD_COLUMNS = ["password", "login_password"];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function findColumn(header: string[], names: string[]): number {
  return header.findIndex((cell) => names.includes(cell.trim().toLowerCase()));
}

function toOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

interface BrowserImportLogin {
  origin: string;
  username: string;
  password: string;
}

export interface ParsedPasswordCsv {
  logins: BrowserImportLogin[];
  skipped: number;
}

export function parsePasswordCsv(text: string): ParsedPasswordCsv {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!header) throw new Error("The file is empty.");
  const urlColumn = findColumn(header, URL_COLUMNS);
  const usernameColumn = findColumn(header, USERNAME_COLUMNS);
  const passwordColumn = findColumn(header, PASSWORD_COLUMNS);
  if (urlColumn < 0 || passwordColumn < 0) {
    throw new Error("The file has no url and password columns. Export passwords as CSV.");
  }
  const logins = new Map<string, BrowserImportLogin>();
  let skipped = 0;
  for (const row of rows) {
    const origin = toOrigin(row[urlColumn] ?? "");
    const password = row[passwordColumn] ?? "";
    const username = usernameColumn < 0 ? "" : (row[usernameColumn] ?? "");
    if (!origin || password === "" || password.length > 1024 || username.length > 1024) {
      skipped += 1;
      continue;
    }
    logins.set(`${origin}\t${username}`, { origin, username, password });
  }
  return { logins: [...logins.values()], skipped };
}
