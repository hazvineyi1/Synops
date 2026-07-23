// EU migration - copy Supabase Storage buckets from the old (US) project to the
// new (EU) project. Lists every bucket, recreates it in the new project, then
// copies every object (download from old, upload to new). Uses the Storage REST
// API with service-role keys (no SDK dependency).
//
// Praxis uses one bucket (default "learning-hub"); Coach/Paideia stores no files
// in object storage (Postgres only), so this is effectively the Praxis project.
// It copies whatever buckets exist, so it is safe to run against either.
//
// The old project is only READ (list + download). All writes go to the new
// project. Existing objects in the new bucket are skipped (idempotent-ish), so a
// re-run resumes rather than duplicating.
//
// Usage:
//   OLD_SUPABASE_URL=... OLD_SUPABASE_SERVICE_ROLE_KEY=... \
//   NEW_SUPABASE_URL=... NEW_SUPABASE_SERVICE_ROLE_KEY=... \
//     npx tsx copy-storage.ts
//
// See ../../EU-CUTOVER-CHECKLIST.md.

const OLD_URL = must("OLD_SUPABASE_URL");
const OLD_KEY = must("OLD_SUPABASE_SERVICE_ROLE_KEY");
const NEW_URL = must("NEW_SUPABASE_URL");
const NEW_KEY = must("NEW_SUPABASE_SERVICE_ROLE_KEY");

function must(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Set ${name}`);
    process.exit(2);
  }
  return v.replace(/\/+$/, "");
}

type Bucket = { id: string; name: string; public: boolean };
type StorageObject = { name: string; id: string | null };

function headers(key: string): Record<string, string> {
  return { apikey: key, authorization: `Bearer ${key}` };
}

async function listBuckets(url: string, key: string): Promise<Bucket[]> {
  const res = await fetch(`${url}/storage/v1/bucket`, { headers: headers(key) });
  if (!res.ok) throw new Error(`list buckets failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Bucket[];
}

async function ensureBucket(url: string, key: string, b: Bucket): Promise<void> {
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers(key), "content-type": "application/json" },
    body: JSON.stringify({ id: b.id, name: b.name, public: b.public }),
  });
  // 409 = already exists, which is fine.
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    if (!text.includes("already exists")) {
      throw new Error(`create bucket ${b.name} failed: ${res.status} ${text}`);
    }
  }
}

// Recursively list every object under a prefix (Supabase list is one level).
async function listObjects(url: string, key: string, bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...headers(key), "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`list ${bucket}/${prefix} failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as StorageObject[];
    if (page.length === 0) break;
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        // A "folder" placeholder - recurse into it.
        out.push(...(await listObjects(url, key, bucket, path)));
      } else {
        out.push(path);
      }
    }
    if (page.length < limit) break;
    offset += limit;
  }
  return out;
}

async function objectExists(url: string, key: string, bucket: string, path: string): Promise<boolean> {
  const res = await fetch(`${url}/storage/v1/object/info/${bucket}/${encodePath(path)}`, {
    headers: headers(key),
  });
  return res.ok;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function copyObject(bucket: string, path: string): Promise<void> {
  const dl = await fetch(`${OLD_URL}/storage/v1/object/${bucket}/${encodePath(path)}`, {
    headers: headers(OLD_KEY),
  });
  if (!dl.ok) throw new Error(`download ${bucket}/${path} failed: ${dl.status}`);
  const contentType = dl.headers.get("content-type") ?? "application/octet-stream";
  const body = Buffer.from(await dl.arrayBuffer());
  const up = await fetch(`${NEW_URL}/storage/v1/object/${bucket}/${encodePath(path)}`, {
    method: "POST",
    headers: { ...headers(NEW_KEY), "content-type": contentType, "x-upsert": "true" },
    body,
  });
  if (!up.ok) throw new Error(`upload ${bucket}/${path} failed: ${up.status} ${await up.text()}`);
}

async function main() {
  const buckets = await listBuckets(OLD_URL, OLD_KEY);
  if (buckets.length === 0) {
    console.log("No storage buckets in the old project. Nothing to copy.");
    return;
  }
  let copied = 0;
  let skipped = 0;
  for (const bucket of buckets) {
    console.log(`\nBucket "${bucket.name}" (public=${bucket.public})`);
    await ensureBucket(NEW_URL, NEW_KEY, bucket);
    const paths = await listObjects(OLD_URL, OLD_KEY, bucket.name);
    console.log(`  ${paths.length} object(s)`);
    for (const path of paths) {
      if (await objectExists(NEW_URL, NEW_KEY, bucket.name, path)) {
        skipped++;
        continue;
      }
      await copyObject(bucket.name, path);
      copied++;
      if (copied % 25 === 0) console.log(`  ... ${copied} copied`);
    }
  }
  console.log(`\nDone. Copied ${copied}, skipped ${skipped} (already present).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
