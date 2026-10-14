import { z } from "zod";
export const installerMarker = Buffer.from("LANSET01", "ascii");
export const installerSettings = z.object({
  serverUrl: z.url().refine((s) => new URL(s).protocol === "https:"),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime(),
});
export function installerTrailer(settings: unknown) {
  const data = Buffer.from(
    JSON.stringify(installerSettings.parse(settings)),
    "utf8",
  );
  if (data.length > 4096) throw new Error("Installer settings too large");
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length);
  return Buffer.concat([data, size, installerMarker]);
}
