import { z } from "zod";

export const BrowserSitePermissionNameSchema = z.enum([
  "notifications",
  "geolocation",
  "camera",
  "microphone",
  "clipboard-read",
]);
export type BrowserSitePermissionName = z.infer<typeof BrowserSitePermissionNameSchema>;

export const BrowserSitePermissionSettingSchema = z.enum(["allow", "block"]);
export type BrowserSitePermissionSetting = z.infer<typeof BrowserSitePermissionSettingSchema>;

export const BrowserSitePermissionExceptionSchema = z.object({
  origin: z.string().min(1).max(2048),
  permission: BrowserSitePermissionNameSchema,
  setting: BrowserSitePermissionSettingSchema,
});

export const BrowserSitePermissionsSchema = z.object({
  defaults: z.object({
    notifications: BrowserSitePermissionSettingSchema,
    geolocation: BrowserSitePermissionSettingSchema,
    camera: BrowserSitePermissionSettingSchema,
    microphone: BrowserSitePermissionSettingSchema,
    "clipboard-read": BrowserSitePermissionSettingSchema,
  }),
  sites: z.array(BrowserSitePermissionExceptionSchema).max(500),
});
export type BrowserSitePermissions = z.infer<typeof BrowserSitePermissionsSchema>;

export const BrowserDownloadSchema = z.object({
  name: z.string(),
  fileName: z.string(),
  bytes: z.number().int().nonnegative(),
  savedAt: z.number(),
});
export type BrowserDownload = z.infer<typeof BrowserDownloadSchema>;

export const BrowserProfileClearDataRequestSchema = z.object({
  type: z.literal("browser.profile.clear_data.request"),
  requestId: z.string(),
});
export const BrowserProfileClearDataResponseSchema = z.object({
  type: z.literal("browser.profile.clear_data.response"),
  payload: z.object({
    requestId: z.string(),
    error: z.string().nullable(),
    cookieCount: z.number().int().nonnegative(),
    originCount: z.number().int().nonnegative(),
  }),
});

export const BrowserDownloadsManageRequestSchema = z.object({
  type: z.literal("browser.downloads.manage.request"),
  requestId: z.string(),
  action: z.enum(["list", "remove"]),
  name: z.string().max(512).optional(),
});
export const BrowserDownloadsManageResponseSchema = z.object({
  type: z.literal("browser.downloads.manage.response"),
  payload: z.object({
    requestId: z.string(),
    error: z.string().nullable(),
    directory: z.string(),
    downloads: z.array(BrowserDownloadSchema),
  }),
});
export type BrowserDownloadsManageRequest = z.infer<typeof BrowserDownloadsManageRequestSchema>;

export const BrowserSitePermissionsManageRequestSchema = z.object({
  type: z.literal("browser.site_permissions.manage.request"),
  requestId: z.string(),
  action: z.enum(["get", "set"]),
  permissions: BrowserSitePermissionsSchema.optional(),
});
export const BrowserSitePermissionsManageResponseSchema = z.object({
  type: z.literal("browser.site_permissions.manage.response"),
  payload: z.object({
    requestId: z.string(),
    error: z.string().nullable(),
    permissions: BrowserSitePermissionsSchema.nullable(),
  }),
});
export type BrowserSitePermissionsManageRequest = z.infer<
  typeof BrowserSitePermissionsManageRequestSchema
>;
