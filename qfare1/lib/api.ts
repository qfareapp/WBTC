const DEFAULT_API_BASE_URL = "http://192.168.16.23:5000";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

type ApiOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};

export const apiRequest = async <T>(path: string, options: ApiOptions = {}): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await parseJson(response);
  if (!response.ok) {
    const message = data?.message || "Request failed";
    throw new Error(message);
  }
  return data as T;
};

export const apiGet = <T>(path: string) => apiRequest<T>(path);

export const apiPost = <T>(path: string, body: unknown) =>
  apiRequest<T>(path, { method: "POST", body });
