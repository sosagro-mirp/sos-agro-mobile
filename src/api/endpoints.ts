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

  // Farmers
  farmersSearch: '/api/farmers/search',
  surveyExtractFarmer: (id: string) => `/api/surveys/${id}/extract-farmer`,
  surveyExtractCrops: (id: string) => `/api/surveys/${id}/extract-crops`,

  // Instruments by code
  instrumentByCode: (code: string) => `/api/instruments/by-code/${code}`,

  // Last farmer for current user
  campaignSessionLastFarmer: '/api/campaign-sessions/last-farmer',

  // Telemetry
  telemetrySync: '/api/telemetry/sync',

  // Media attachments
  mediaPresignedUrl: '/api/media-attachments/presigned-url',
  mediaConfirmUpload: (id: string) => `/api/media-attachments/${id}/confirm`,
} as const;
