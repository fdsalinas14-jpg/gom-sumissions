const env = (k, d = '') => (process.env[k] ?? d).toString().trim();

export const ghlConfig = () => ({
  base: env('GHL_BASE', 'https://services.leadconnectorhq.com'),
  token: env('GHL_TOKEN'),
  locationId: env('GHL_LOCATION_ID'),
  userId: env('GHL_USER_ID'),
  fromEmail: env('GHL_FROM_EMAIL'),
  fromName: env('GHL_FROM_NAME', 'Climatisation GOM'),
  pipelineId: env('GHL_PIPELINE_ID'),
  stageId: env('GHL_STAGE_ID'),
  liveMode: env('GHL_LIVE_MODE', 'true') !== 'false',
});
