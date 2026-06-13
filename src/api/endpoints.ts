export const endpoints = {
  // Instruments
  instrumentRender: (id: string) => `/api/instruments/${id}/render`,

  // Surveys
  surveys: "/api/surveys",
  surveySync: (id: string) => `/api/surveys/${id}/sync`,

  // Responses
  responsesBatch: "/api/responses/batch",

  // Campaigns
  campaignsActive: "/api/campaigns/active",
  campaignRender: (id: string) => `/api/campaigns/${id}/render`,

  // Campaign sessions
  campaignSessions: "/api/campaign-sessions",
  campaignSessionNextStep: (id: string) => `/api/campaign-sessions/${id}/next-step`,
  campaignSessionSync: (id: string) => `/api/campaign-sessions/${id}/sync`,

  // Telemetry
  telemetrySync: '/api/telemetry/sync',
} as const;
