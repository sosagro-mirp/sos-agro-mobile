import type { Router } from 'expo-router';
import { returnPathAfterSurvey } from './surveyAnchor';

// Spec 103 (C6) — las pantallas de una encuesta se apilan con push; dismissTo
// vuelve a la ficha del productor descartándolas (cae en replace si no está).
export function leaveToFarmer(router: Router, farmerId: string): void {
  router.dismissTo(returnPathAfterSurvey({ farmerId }) as Parameters<Router['dismissTo']>[0]);
}
