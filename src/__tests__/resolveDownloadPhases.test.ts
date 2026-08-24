import { resolveDownloadPhases } from '../lib/resolveDownloadPhases';
import type { DownloadProgress } from '../store/useCachedCampaignsStore';

describe('resolveDownloadPhases', () => {
  it('devuelve [] sin progreso en curso', () => {
    expect(resolveDownloadPhases(null)).toEqual([]);
  });

  it('marca "done" las fases anteriores a la actual y "pending" las siguientes', () => {
    const progress: DownloadProgress = {
      phase: 'instruments',
      currentName: 'Caracterización — Café v2.1',
      done: 3,
      total: 5,
    };

    const rows = resolveDownloadPhases(progress);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'campaigns', status: 'done', percent: 100 });
    expect(rows[1]).toMatchObject({
      kind: 'instruments',
      status: 'current',
      done: 3,
      total: 5,
      percent: 60,
      currentName: 'Caracterización — Café v2.1',
    });
    expect(rows[2]).toMatchObject({ kind: 'farmers', status: 'pending', percent: 0, currentName: null });
  });

  it('la fase actual con total 0 no divide por cero', () => {
    const progress: DownloadProgress = {
      phase: 'farmers',
      currentName: 'Guardando encuestados…',
      done: 0,
      total: 0,
    };

    const rows = resolveDownloadPhases(progress);
    const current = rows.find((r) => r.kind === 'farmers')!;

    expect(current.percent).toBe(0);
    expect(current.status).toBe('current');
  });

  it('en la primera fase no hay ninguna "done"', () => {
    const progress: DownloadProgress = {
      phase: 'campaigns',
      currentName: 'Obteniendo campañas…',
      done: 0,
      total: 4,
    };

    const rows = resolveDownloadPhases(progress);

    expect(rows.every((r) => r.status !== 'done')).toBe(true);
    expect(rows[0]!.status).toBe('current');
  });
});
