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

export const BrowserSyncCookieSchema = z.object({
  name: z.string().max(4096),
  value: z.string().max(65536),
  domain: z.string().min(1).max(253),
  path: z.string().max(4096),
  expires: z.number(),
  httpOnly: z.boolean(),
  secure: z.boolean(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
});
export type BrowserSyncCookie = z.infer<typeof BrowserSyncCookieSchema>;

export const BrowserSyncCookieKeySchema = z.object({
  name: z.string().max(4096),
  domain: z.string().min(1).max(253),
  path: z.string().max(4096),
});

export const BrowserSyncLoginSchema = z.object({
  origin: z.string().max(2048),
  username: z.string().max(1024),
  password: z.string().min(1).max(1024),
});

export const BrowserSyncHistoryEntrySchema = z.object({
  url: z.string().max(4096),
  title: z.string().max(400),
  visitCount: z.number().int().positive(),
  lastVisitedAt: z.number(),
});
export type BrowserSyncHistoryEntry = z.infer<typeof BrowserSyncHistoryEntrySchema>;

export const BrowserProfileSyncRequestSchema = z.object({
  type: z.literal("browser.profile.sync.request"),
  requestId: z.string(),
  cookies: z
    .object({
      upserts: z.array(BrowserSyncCookieSchema).max(20_000),
      removed: z.array(BrowserSyncCookieKeySchema).max(20_000),
    })
    .optional(),
  knownCookieVersion: z.string().max(128).optional(),
  wantCookies: z.boolean().optional(),
  logins: z.array(BrowserSyncLoginSchema).max(100_000).optional(),
  wantLogins: z.boolean().optional(),
  history: z
    .object({
      entries: z.array(BrowserSyncHistoryEntrySchema).max(5_000),
      clear: z.boolean().optional(),
    })
    .optional(),
});
export const BrowserProfileSyncResponseSchema = z.object({
  type: z.literal("browser.profile.sync.response"),
  payload: z.object({
    requestId: z.string(),
    error: z.string().nullable(),
    cookieVersion: z.string().optional(),
    cookies: z.array(BrowserSyncCookieSchema).optional(),
    logins: z.array(BrowserSyncLoginSchema).optional(),
    history: z.array(BrowserSyncHistoryEntrySchema).optional(),
  }),
});
export type BrowserProfileSyncRequest = z.infer<typeof BrowserProfileSyncRequestSchema>;
