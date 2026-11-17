"use strict";

let tokenProvider = null;

// Registers an asynchronous provider supplying the current Firebase ID token
export function setTokenProvider(provider) {
  tokenProvider = provider;
}

// Executes an authenticated JSON request attaching the Bearer token
export async function adminRequest(url, options = {}) {
  const requestOptions = {
    ...options,
    headers: { ...(options.headers || {}) },
  };

  if (typeof tokenProvider === "function") {
    const token = await tokenProvider();
    if (token) {
      requestOptions.headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, requestOptions);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`The server returned non-JSON response (${response.status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Unable to parse server JSON response.");
  }

  if (!response.ok) {
    const error = new Error(payload.error || payload.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return payload;
}
