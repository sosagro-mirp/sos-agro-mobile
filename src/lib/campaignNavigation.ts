import type { Href, Router } from 'expo-router';

// Screens within an instrument (question/[index], start) are reached via
// router.push, so they stack up in navigation history across an entire
// campaign session. dismissTo discards every screen back to pre-survey
// (the one screen that's never replaced during an active session) before
// pushing the real destination — otherwise a stale question screen from
// the previous instrument stays reachable via the native back button, and
// re-syncs against the current (different) instrument's survey store,
// landing on "No hay preguntas disponibles" with no way out.
//
// dismissTo falls back to a plain replace() if pre-survey isn't found in
// history, so this never throws — it just may not fully clean up in that
// unexpected case (spec23 Fase 3 adds an independent defensive guard for
// that scenario).

function preSurveyHref(campaignId: string): Href {
  return `/campaign/${campaignId}/pre-survey`;
}

/** Advance to a new instrument/step within a campaign, discarding the
 * previous instrument's stacked screens first. */
export function advanceWithinCampaign(
  router: Router,
  campaignId: string,
  targetHref: Href,
): void {
  router.dismissTo(preSurveyHref(campaignId));
  router.push(targetHref);
}

/** Return directly to pre-survey (cancel / retry-from-scratch flows). */
export function returnToPreSurvey(router: Router, campaignId: string): void {
  router.dismissTo(preSurveyHref(campaignId));
}
