export interface CorsConfig {
  frontendUrl: string;
  corsOrigin: string;
  nodeEnv: string;
}

export function isAllowedCorsOrigin(origin: string | undefined, config: CorsConfig): boolean {
  if (!origin) return true;

  const allowedOrigins = [
    config.frontendUrl,
    ...(config.corsOrigin === '*'
      ? ['*']
      : config.corsOrigin.split(',').map((value) => value.trim()))
  ].filter(Boolean);

  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return true;
  return config.nodeEnv !== 'production' && origin.startsWith('http://localhost:');
}
