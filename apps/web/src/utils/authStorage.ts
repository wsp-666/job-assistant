const TOKEN_KEY = "job_assistant_token";

export function getAuthToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new CustomEvent("job-assistant-auth-changed"));
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new CustomEvent("job-assistant-auth-changed"));
}
