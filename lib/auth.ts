// Tracks whether the user has pressed Start, stored as a flag in localStorage.
const KEY = "ble-scout:user";

export function getUser(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function login(user: string) {
  localStorage.setItem(KEY, user);
}

export function logout() {
  localStorage.removeItem(KEY);
}
