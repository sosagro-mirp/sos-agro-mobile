import { create } from 'zustand';
import type { PolygonPoint } from '../api/farmPlots';

interface FarmPlotCaptureState {
  farmId: string | null;
  farmName: string | null;
  points: PolygonPoint[];
  isCapturing: boolean;

  startCapture: (farmId: string, farmName: string) => void;
  addPoint: (point: PolygonPoint) => void;
  removeLastPoint: () => void;
  reset: () => void;
}

export const useFarmPlotCaptureStore = create<FarmPlotCaptureState>((set) => ({
  farmId: null,
  farmName: null,
  points: [],
  isCapturing: false,

  startCapture: (farmId, farmName) =>
    set({ farmId, farmName, points: [], isCapturing: true }),

  addPoint: (point) =>
    set((state) => ({ points: [...state.points, point] })),

  removeLastPoint: () =>
    set((state) => ({ points: state.points.slice(0, -1) })),

  reset: () =>
    set({ farmId: null, farmName: null, points: [], isCapturing: false }),
}));
