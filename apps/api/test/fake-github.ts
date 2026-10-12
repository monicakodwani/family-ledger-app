/**
 * A minimal in-memory imitation of the GitHub Git Data + Contents APIs,
 * sufficient to exercise GitHubLedgerStore (including non-fast-forward refusal).
 */
export function createFakeGitHub(owner = "fam", repo = "family-ledger-private-data") {
  let n = 0;
  const sha = () => (++n).toString(16).padStart(40, "0");
  const blobs = new Map<string, string>();
  const trees = new Map<string, Map<string, string>>(); // tree sha -> path -> blob sha
  const commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  const readmeBlob = sha();
  blobs.set(readmeBlob, "# private");
  const rootTree = sha();
  trees.set(rootTree, new Map([["README.md", readmeBlob]]));
  const root = sha();
  commits.set(root, { tree: rootTree, parents: [], message: "init" });
  let head = root;
  const requests: Array<{ method: string; path: string; auth: string | null }> = [];
  let failNextRefUpdate = false;

  const respond = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), { status });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const prefix = `/repos/${owner}/${repo}`;
    requests.push({ method, path: url.pathname, auth: headers.get("Authorization") });
    if (!url.pathname.startsWith(prefix)) return respond(404);
    const p = url.pathname.slice(prefix.length);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (method === "GET" && p === "/git/ref/heads/main") return respond(200, { object: { sha: head } });
    if (method === "GET" && p.startsWith("/git/commits/")) {
      const c = commits.get(p.split("/").pop()!);
      return c ? respond(200, { sha: p.split("/").pop(), tree: { sha: c.tree } }) : respond(404);
    }
    if (method === "GET" && p.startsWith("/contents/")) {
      const path = decodeURIComponent(p.slice("/contents/".length));
      const c = commits.get(url.searchParams.get("ref") ?? head);
      const blob = c ? trees.get(c.tree)?.get(path) : undefined;
      return blob ? respond(200, blobs.get(blob)!) : respond(404, { message: "Not Found" });
    }
    if (method === "POST" && p === "/git/blobs") {
      const s = sha();
      blobs.set(s, body.content);
      return respond(201, { sha: s });
    }
    if (method === "POST" && p === "/git/trees") {
      const base = new Map(trees.get(body.base_tree) ?? []);
      for (const entry of body.tree) base.set(entry.path, entry.sha);
      const s = sha();
      trees.set(s, base);
      return respond(201, { sha: s });
    }
    if (method === "POST" && p === "/git/commits") {
      const s = sha();
      commits.set(s, { tree: body.tree, parents: body.parents, message: body.message });
      return respond(201, { sha: s });
    }
    if (method === "PATCH" && p === "/git/refs/heads/main") {
      const c = commits.get(body.sha);
      if (failNextRefUpdate || !c || (!body.force && !c.parents.includes(head))) {
        failNextRefUpdate = false;
        return respond(422, { message: "Update is not a fast forward" });
      }
      head = body.sha;
      return respond(200, { object: { sha: head } });
    }
    return respond(404);
  }) as typeof fetch;

  return {
    fetch: fetchImpl,
    requests,
    allBlobContents: () => [...blobs.values()],
    headCommit: () => commits.get(head)!,
    filesAtHead: () => [...trees.get(commits.get(head)!.tree)!.keys()],
    /** Simulate another writer committing directly. */
    advanceHeadExternally: () => {
      const c = commits.get(head)!;
      const s = sha();
      commits.set(s, { tree: c.tree, parents: [head], message: "external" });
      head = s;
    },
    failNextRefUpdate: () => {
      failNextRefUpdate = true;
    },
  };
}
