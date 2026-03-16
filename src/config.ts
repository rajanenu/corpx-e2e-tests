import "dotenv/config";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const baseUrl = trimTrailingSlash(process.env.CORPX_BASE_URL || "http://127.0.0.1:4173");
const configuredApiBaseUrl = process.env.CORPX_API_BASE_URL
  ? trimTrailingSlash(process.env.CORPX_API_BASE_URL)
  : `${baseUrl}/api/v1`;

export const config = {
  baseUrl,
  apiBaseUrl: configuredApiBaseUrl,
  defaultOrganization: process.env.CORPX_DEFAULT_ORGANIZATION || "DEFAULT",
  defaultCity: process.env.CORPX_DEFAULT_CITY || "Bangalore",
  fixedOtp: process.env.CORPX_FIXED_OTP || "000000",
};
