import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "sosagro_access_token";

export const secureStorage = {
  saveToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),

  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),

  deleteToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};
