/**
 * Spec 92 — lógica de carga de «Encuestas realizadas» (modo remoto/local,
 * paginación, caída ante fallos y recarga al enfocar). Es la lógica del hook
 * `useCompletedSurveys`, sin React, con dependencias inyectadas.
 */
import {
  COMPLETED_PAGE_SIZE,
  EMPTY_COMPLETED_LIST,
  hasMorePages,
  loadFirstPage,
  loadNextPage,
  refreshOnFocus,
  type CompletedListData,
  type CompletedLoaderDeps,
} from "../lib/completedSurveysLoader";
import type { LocalFinishedSurvey } from "../lib/mergeCompletedSurveys";
import type { MySurveyItem } from "../types";

const remoteItem = (id: string): MySurveyItem => ({
  surveyId: id,
  clientSurveyId: null,
  instrumentName: "Bloque 1",
  campaignName: null,
  farmer: { farmerId: "f", name: "Ana" },
  responseCount: 3,
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt: "2026-09-20T10:00:00.000Z",
});

const localItem = (id: string): LocalFinishedSurvey => ({
  clientSurveyId: id,
  backendSurveyId: null,
  status: "completed",
  syncFailed: false,
  farmerName: "Ana",
  farmerDocumentId: "1",
  instrumentName: "Bloque 1",
  responseCount: 3,
  createdAt: "2026-09-21T10:00:00.000Z",
});

const page = (ids: string[], p: number, total: number) => ({ items: ids.map(remoteItem), total, page: p, limit: COMPLETED_PAGE_SIZE });

function makeDeps(over: Partial<CompletedLoaderDeps> = {}): CompletedLoaderDeps & { getMySurveys: jest.Mock; listFinished: jest.Mock } {
  return {
    isOnline: true,
    search: "",
    getActiveUserId: jest.fn().mockResolvedValue("user-1"),
    listFinished: jest.fn().mockResolvedValue([localItem("l1")]),
    getMySurveys: jest.fn().mockResolvedValue(page(["s1", "s2"], 1, 2)),
    ...over,
  } as never;
}

describe("loadFirstPage", () => {
  it("con conexión: modo remoto, sin aviso, con las locales del encuestador activo", async () => {
    const deps = makeDeps();
    const data = await loadFirstPage(deps);

    expect(data).toMatchObject({ mode: "remote", degraded: false, page: 1, total: 2 });
    expect(data.remote.map((r) => r.surveyId)).toEqual(["s1", "s2"]);
    expect(data.local.map((l) => l.clientSurveyId)).toEqual(["l1"]);
    expect(deps.listFinished).toHaveBeenCalledWith("user-1");
    expect(deps.getMySurveys).toHaveBeenCalledWith({ page: 1, limit: COMPLETED_PAGE_SIZE, search: undefined });
  });

  it("sin conexión (o sesión por renovar, que apaga isOnline): modo local con aviso y sin tocar la red", async () => {
    const deps = makeDeps({ isOnline: false });
    const data = await loadFirstPage(deps);

    expect(data).toMatchObject({ mode: "local", degraded: true, remote: [] });
    expect(data.local).toHaveLength(1);
    expect(deps.getMySurveys).not.toHaveBeenCalled();
  });

  it.each([
    ["red caída", new Error("Network request failed")],
    ["401", Object.assign(new Error("Unauthorized"), { status: 401 })],
    ["5xx", Object.assign(new Error("Bad gateway"), { status: 502 })],
  ])("con conexión pero el servidor falla (%s): cae al modo local con aviso, sin lanzar", async (_n, error) => {
    const deps = makeDeps({ getMySurveys: jest.fn().mockRejectedValue(error) });
    const data = await loadFirstPage(deps);

    expect(data).toMatchObject({ mode: "local", degraded: true, remote: [] });
    expect(data.local.map((l) => l.clientSurveyId)).toEqual(["l1"]);
  });

  it("sin encuestador activo no lista nada local", async () => {
    const deps = makeDeps({ getActiveUserId: jest.fn().mockResolvedValue(null), isOnline: false });
    const data = await loadFirstPage(deps);

    expect(data.local).toEqual([]);
    expect(deps.listFinished).not.toHaveBeenCalled();
  });

  it("si leer lo local falla, la lista remota sigue funcionando", async () => {
    const deps = makeDeps({ listFinished: jest.fn().mockRejectedValue(new Error("db")) });
    const data = await loadFirstPage(deps);

    expect(data.mode).toBe("remote");
    expect(data.local).toEqual([]);
  });

  it("envía la búsqueda recortada, y nada si queda vacía", async () => {
    const withText = makeDeps({ search: "  ana  " });
    await loadFirstPage(withText);
    expect(withText.getMySurveys).toHaveBeenCalledWith(expect.objectContaining({ search: "ana" }));

    const blank = makeDeps({ search: "   " });
    await loadFirstPage(blank);
    expect(blank.getMySurveys).toHaveBeenCalledWith(expect.objectContaining({ search: undefined }));
  });
});

describe("loadNextPage", () => {
  const firstPage = async () =>
    loadFirstPage(makeDeps({ getMySurveys: jest.fn().mockResolvedValue(page(["s1"], 1, 25)) }));

  it("hasMorePages: solo en modo remoto sano y con páginas pendientes", async () => {
    expect(hasMorePages(await firstPage())).toBe(true);
    expect(hasMorePages(EMPTY_COMPLETED_LIST)).toBe(false);
    expect(hasMorePages({ ...(await firstPage()), degraded: true })).toBe(false);
    expect(hasMorePages({ ...(await firstPage()), total: COMPLETED_PAGE_SIZE })).toBe(false);
  });

  it("agrega la página siguiente al acumulado", async () => {
    const data = await firstPage();
    const deps = makeDeps({ getMySurveys: jest.fn().mockResolvedValue(page(["s2", "s3"], 2, 25)) });
    const next = await loadNextPage(deps, data);

    expect(next.remote.map((r) => r.surveyId)).toEqual(["s1", "s2", "s3"]);
    expect(next.page).toBe(2);
    expect(deps.getMySurveys).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("si falla, conserva los ítems remotos ya visibles y marca el aviso", async () => {
    const data = await firstPage();
    const deps = makeDeps({ getMySurveys: jest.fn().mockRejectedValue(new Error("Network")) });
    const next = await loadNextPage(deps, data);

    expect(next.remote.map((r) => r.surveyId)).toEqual(["s1"]);
    expect(next.mode).toBe("remote");
    expect(next.degraded).toBe(true);
    expect(hasMorePages(next)).toBe(false);
  });

  it("no pide nada si no hay más páginas", async () => {
    const deps = makeDeps();
    const data: CompletedListData = { ...EMPTY_COMPLETED_LIST };
    expect(await loadNextPage(deps, data)).toBe(data);
    expect(deps.getMySurveys).not.toHaveBeenCalled();
  });
});

describe("refreshOnFocus", () => {
  it("lista remota sana: relee solo lo local y conserva las páginas cargadas", async () => {
    const loaded = await loadNextPage(
      makeDeps({ getMySurveys: jest.fn().mockResolvedValue(page(["s2"], 2, 25)) }),
      await loadFirstPage(makeDeps({ getMySurveys: jest.fn().mockResolvedValue(page(["s1"], 1, 25)) })),
    );
    const deps = makeDeps({ listFinished: jest.fn().mockResolvedValue([localItem("l1"), localItem("l-nueva")]) });

    const next = await refreshOnFocus(deps, loaded);

    expect(next.remote.map((r) => r.surveyId)).toEqual(["s1", "s2"]);
    expect(next.page).toBe(2);
    expect(next.local.map((l) => l.clientSurveyId)).toEqual(["l1", "l-nueva"]);
    expect(deps.getMySurveys).not.toHaveBeenCalled();
  });

  it("lista en modo local o degradada: hace la carga completa", async () => {
    const degraded = await loadFirstPage(makeDeps({ isOnline: false }));
    const deps = makeDeps();

    const next = await refreshOnFocus(deps, degraded);

    expect(next.mode).toBe("remote");
    expect(deps.getMySurveys).toHaveBeenCalledTimes(1);
  });
});
