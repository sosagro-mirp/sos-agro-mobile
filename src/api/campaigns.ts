import { httpClient } from "./httpClient";
import { endpoints } from "./endpoints";
import type { CampaignActiveSummary, CampaignRender } from "../types";

export const fetchActiveCampaigns = () =>
  httpClient.get<CampaignActiveSummary[]>(endpoints.campaignsActive);

export const fetchCampaignRender = (id: string) =>
  httpClient.get<CampaignRender>(endpoints.campaignRender(id));
