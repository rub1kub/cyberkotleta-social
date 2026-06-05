import JSZip from "jszip";
import type { PackMod } from "./modrinth";

type Loader = "fabric" | "forge" | "neoforge" | "quilt";

type BuildMrpackOptions = {
  name: string;
  summary: string;
  gameVersion: string;
  loader: Loader;
  loaderVersion: string;
  mods: PackMod[];
};

const dependencyByLoader: Record<Loader, string> = {
  fabric: "fabric-loader",
  forge: "forge",
  neoforge: "neoforge",
  quilt: "quilt-loader",
};

const defaultPackName = "Модпак CyberKotleta";

export async function downloadMrpack(options: BuildMrpackOptions): Promise<void> {
  const zip = new JSZip();
  const dependencies: Record<string, string> = {
    minecraft: options.gameVersion,
  };

  if (options.loaderVersion.trim()) {
    dependencies[dependencyByLoader[options.loader]] = options.loaderVersion.trim();
  }

  zip.file(
    "modrinth.index.json",
    JSON.stringify(
      {
        formatVersion: 1,
        game: "minecraft",
        versionId: makeVersionId(options.name),
        name: options.name.trim() || defaultPackName,
        summary: options.summary.trim() || undefined,
        files: options.mods.map((mod) => ({
          path: `mods/${mod.fileName}`,
          hashes: mod.hashes,
          env: mod.env,
          downloads: [mod.fileUrl],
          fileSize: mod.size,
        })),
        dependencies,
      },
      null,
      2,
    ),
  );

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/x-modrinth-modpack+zip",
  });
  downloadBlob(blob, `${makeVersionId(options.name)}.mrpack`);
}

export async function downloadZipPack(options: BuildMrpackOptions): Promise<void> {
  const zip = new JSZip();
  const modsFolder = zip.folder("mods");
  if (!modsFolder) {
    throw new Error("Cannot create mods folder");
  }

  await Promise.all(
    options.mods.map(async (mod) => {
      const response = await fetch(mod.fileUrl);
      if (!response.ok) {
        throw new Error(`Cannot download ${mod.fileName}: ${response.status}`);
      }
      modsFolder.file(mod.fileName, await response.blob());
    }),
  );

  zip.file(
    "cyberkotleta-pack.json",
    JSON.stringify(
      {
        name: options.name.trim() || defaultPackName,
        gameVersion: options.gameVersion,
        loader: options.loader,
        loaderVersion: options.loaderVersion,
        mods: options.mods.map((mod) => ({
          title: mod.title,
          fileName: mod.fileName,
          version: mod.versionNumber,
          source: mod.fileUrl,
        })),
      },
      null,
      2,
    ),
  );

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
  });
  downloadBlob(blob, `${makeVersionId(options.name)}.zip`);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function makeVersionId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "cyberkotleta-pack";
}
