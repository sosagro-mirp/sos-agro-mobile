export const endpoints = {
  // Health (spec 81, Fase 4 — sondeo bajo demanda de disponibilidad del backend)
  health: '/api/health',

  // Instruments
  instrumentRender: (id: string) => `/api/instruments/${id}/render`,

  // Surveys
  surveys: "/api/surveys",
  surveySync: (id: string) => `/api/surveys/${id}/sync`,

  // Responses
  responses: "/api/responses",
  responsesBatch: "/api/responses/batch",

  // Campaigns
  campaignsActive: "/api/campaigns/active",
  campaignRender: (id: string) => `/api/campaigns/${id}/render`,

  // Campaign sessions
  campaignSessions: "/api/campaign-sessions",
  campaignSessionNextStep: (id: string) => `/api/campaign-sessions/${id}/next-step`,
  campaignSessionSync: (id: string) => `/api/campaign-sessions/${id}/sync`,

  // Farmers
  farmers: '/api/farmers',
  farmersSearch: '/api/farmers/search',
  surveyExtractFarmer: (id: string) => `/api/surveys/${id}/extract-farmer`,
  surveyExtractCrops: (id: string) => `/api/surveys/${id}/extract-crops`,

  // Instruments by code
  instrumentByCode: (code: string) => `/api/instruments/by-code/${code}`,

  // Duplicate survey detection
  surveyCheckDuplicate: '/api/surveys/check-duplicate',
  surveyOverwrite: '/api/surveys/overwrite',
  surveySkipStep: '/api/surveys/skip-step',

  // Media attachments
  mediaAttachmentsPresignedUrl: '/api/media-attachments/presigned-url',
  mediaAttachmentsConfirm: (id: string) => `/api/media-attachments/${id}/confirm`,

  // Farm plots
  farmPlotsCreate: '/api/farm-plots',
  farmPlotsByFarm: (farmId: string) => `/api/farm-plots/by-farm/${farmId}`,

  // Telemetry
  telemetrySync: '/api/telemetry/sync',

  // Change requests
  changeRequests: '/api/change-requests',
  changeRequestsMyResolved: '/api/change-requests/my-resolved',

  // Question options (dynamic creation)
  questionOptions: (questionId: string) => `/api/questions/${questionId}/options`,

  // Consent (spec 78)
  consentDocumentActive: '/api/consent-documents/active',
  consents: '/api/consents',
  farmerConsentStatus: (farmerId: string) => `/api/farmers/${farmerId}/consent`,
} as const;
