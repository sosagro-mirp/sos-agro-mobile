import * as SecureStore from "expo-secure-store";
import type { LastFarmerResult } from "../types";

const TOKEN_KEY = "sosagro_access_token";
const LAST_FARMER_KEY = "sosagro_last_farmer";

export const secureStorage = {
  saveToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),

  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),

  deleteToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),

  saveLastFarmer: (farmer: LastFarmerResult): Promise<void> =>
    farmer
      ? SecureStore.setItemAsync(LAST_FARMER_KEY, JSON.stringify(farmer))
      : SecureStore.deleteItemAsync(LAST_FARMER_KEY),

  getLastFarmer: async (): Promise<LastFarmerResult> => {
    const data = await SecureStore.getItemAsync(LAST_FARMER_KEY);
    return data ? (JSON.parse(data) as LastFarmerResult) : null;
  },
};
