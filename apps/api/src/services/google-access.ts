import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

export async function googleAccessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token)
    throw new Error('Google application credentials did not provide an access token.');
  return token.token;
}

export async function googleJsonRequest<T>(
  url: string,
  body: unknown,
  timeoutMs = 40_000,
): Promise<T> {
  const token = await googleAccessToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API request failed (${response.status}): ${error.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}
