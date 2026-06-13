import { create } from 'zustand';
import { instrumentCacheStorage } from '../storage/instrumentCache';
import { fetchInstrumentRender } from '../api/instruments';
import type { InstrumentResponse } from '../types';

interface CachedInstrumentsState {
  instruments: InstrumentResponse[];
  isLoading: boolean;
  error: string | null;

  loadFromCache: () => Promise<void>;
  downloadAndCache: (id: string) => Promise<InstrumentResponse>;
  isInstrumentCached: (id: string) => boolean;
  remove: (id: string) => Promise<void>;
}

export const useCachedInstrumentsStore = create<CachedInstrumentsState>((set, get) => ({
  instruments: [],
  isLoading: false,
  error: null,

  async loadFromCache() {
    try {
      const instruments = await instrumentCacheStorage.list();
      set({ instruments });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Error cargando instrumentos' });
    }
  },

  async downloadAndCache(id) {
    set({ isLoading: true, error: null });
    try {
      const instrument = await fetchInstrumentRender(id);
      await instrumentCacheStorage.save(instrument);
      const instruments = await instrumentCacheStorage.list();
      set({ instruments });
      return instrument;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error descargando instrumento';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  isInstrumentCached(id) {
    return get().instruments.some((i) => i.instrumentId === id);
  },

  async remove(id) {
    await instrumentCacheStorage.remove(id);
    const { instruments } = get();
    set({ instruments: instruments.filter((i) => i.instrumentId !== id) });
  },
}));
