const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export type ErrorType<ErrorData> = Error & {
  info?: ErrorData;
  status?: number;
};

export type BodyType<BodyData> = BodyData;

export async function apiFetch<ResponseData>(
  url: string,
  options: RequestInit,
): Promise<ResponseData> {
  const response = await fetch(new URL(url, apiBaseUrl), options);
  const body = [204, 205, 304].includes(response.status) ? '' : await response.text();
  const data: unknown = body.length > 0 ? JSON.parse(body) : undefined;

  if (!response.ok) {
    const error = new Error(
      `API request failed with status ${response.status}`,
    ) as ErrorType<unknown>;
    error.info = data;
    error.status = response.status;
    throw error;
  }

  return data as ResponseData;
}
