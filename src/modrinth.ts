export type ModrinthProject = {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  icon_url: string | null;
  downloads: number;
  follows: number;
  client_side: "required" | "optional" | "unsupported" | "unknown";
  server_side: "required" | "optional" | "unsupported" | "unknown";
  project_type: "mod" | "modpack" | "resourcepack" | "shader";
};

export type ModrinthVersionFile = {
  hashes: {
    sha1: string;
    sha512: string;
  };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
};

export type ModrinthVersion = {
  id: string;
  project_id: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: ModrinthVersionFile[];
};

export type PackMod = {
  projectId: string;
  slug: string;
  title: string;
  author: string;
  versionId: string;
  versionNumber: string;
  fileName: string;
  fileUrl: string;
  hashes: {
    sha1: string;
    sha512: string;
  };
  size: number;
  env: {
    client: "required" | "optional" | "unsupported";
    server: "required" | "optional" | "unsupported";
  };
};

type SearchResponse = {
  hits: ModrinthProject[];
};

const apiBase = "https://api.modrinth.com/v2";

export async function searchModrinthProjects(
  query: string,
  gameVersion: string,
  loader: string,
): Promise<ModrinthProject[]> {
  const facets = [
    ["project_type:mod"],
    [`versions:${gameVersion}`],
    [`categories:${loader}`],
  ];
  const params = new URLSearchParams({
    query,
    facets: JSON.stringify(facets),
    index: "downloads",
    limit: "12",
  });
  const response = await fetch(`${apiBase}/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Modrinth search failed: ${response.status}`);
  }
  const data = (await response.json()) as SearchResponse;
  return data.hits;
}

export async function resolvePackMod(
  project: ModrinthProject,
  gameVersion: string,
  loader: string,
): Promise<PackMod> {
  const params = new URLSearchParams({
    loaders: JSON.stringify([loader]),
    game_versions: JSON.stringify([gameVersion]),
    include_changelog: "false",
  });
  const response = await fetch(`${apiBase}/project/${project.project_id}/version?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Version lookup failed: ${response.status}`);
  }
  const versions = (await response.json()) as ModrinthVersion[];
  const version = versions.find((item) => item.files.length > 0);
  const file = version?.files.find((item) => item.primary) ?? version?.files[0];
  if (!version || !file) {
    throw new Error("No compatible version");
  }

  return {
    projectId: project.project_id,
    slug: project.slug,
    title: project.title,
    author: project.author,
    versionId: version.id,
    versionNumber: version.version_number,
    fileName: file.filename,
    fileUrl: file.url,
    hashes: file.hashes,
    size: file.size,
    env: {
      client: toPackEnv(project.client_side),
      server: toPackEnv(project.server_side),
    },
  };
}

function toPackEnv(value: ModrinthProject["client_side"]): "required" | "optional" | "unsupported" {
  if (value === "optional" || value === "unsupported") return value;
  return "required";
}
