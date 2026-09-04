import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const STORAGE_KEY_API_URL = "@personal_finance_api_url";

// Default LAN URL for mobile devices on local network
const DEFAULT_API_URL = "http://192.168.3.172:8000";

let cachedApiUrl: string | null = null;

export async function getApiBaseUrl(): Promise<string> {
  if (cachedApiUrl) return cachedApiUrl;
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY_API_URL);
    if (saved && saved.trim() !== "") {
      cachedApiUrl = saved.trim().replace(/\/+$/, "");
      return cachedApiUrl;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_API_URL;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  const cleanUrl = url.trim().replace(/\/+$/, "");
  cachedApiUrl = cleanUrl;
  await AsyncStorage.setItem(STORAGE_KEY_API_URL, cleanUrl);
}
