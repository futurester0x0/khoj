import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "khoj/0.1";
const REQUEST_TIMEOUT_MS = 30000;
const REQUEST_DELAY_MS = 250;
const OUTPUT_PATH = path.join(process.cwd(), "public", "jobs.json");
const SOURCES_PATH = path.join(process.cwd(), "scripts", "sources.json");

const STRONG_TITLE_RE =
  /\b(supply chain|procurement|purchasing|sourcing|buyer|logistics|logistic|inventory|warehouse|fulfillment|demand planning|s&op|sales and operations|vendor management|category management|transport(?:ation)?|distribution|freight|shipping|customs|scm|ewm|production planning|materials planning|planner|scheduler|dispatcher|cargo)\b/i;
const OPERATIONS_TITLE_RE = /\b(operations?|operational)\b/i;
const STRONG_CATEGORY_RE =
  /\b(supply[- ]chain|procurement|purchasing|sourcing|logistics|inventory|warehouse|fulfillment|transportation|distribution)\b/i;
const STRONG_DESCRIPTION_RE =
  /\b(supply chain|procurement|purchasing|sourcing|inventory management|demand planning|vendor management|category management|sales and operations planning|s&op|freight|warehouse management|fulfillment|logistics)\b/i;
const EXCLUDED_OPERATIONS_RE =
  /\b(people|marketing|sales|revenue|growth|customer success|customer support|accounting|finance|payroll|clinical|medical|military|flight|security|devops|it|technology|trading|payment|design|sportsbook|gaming)\s+operations?\b/i;
const EXCLUDED_TITLE_RE =
  /\b(ai trainer|freelance ai trainer|talent pool|join our talent|don't see what you're looking for|careers in|recruiter|talent acquisition|talent specialist|sourcer|researcher|media buyer|programmatic|affiliate|native ads|paid social|paid search|army|combat|co-?founder|instructor|coaching|training operations|cx operations|customer experience operations|cold email|travel operations|business development|erp consultant|overseas operations manager|business operations expert)\b/i;

function decodeEntities(value = "") {
  return value
    .replace(/\u00e2\u0080\u0094/g, "\u2014")
    .replace(/\u00e2\u0080\u0093/g, "\u2013")
    .replace(/\u00e2\u0080\u0099/g, "\u2019")
    .replace(/\u00e2\u0080\u009c/g, "\u201c")
    .replace(/\u00e2\u0080\u009d/g, "\u201d")
    .replace(/\u00e2\u0080\u00a6/g, "\u2026")
    .replace(/\u00c2\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function stripHtml(value = "") {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value = "") {
  return decodeEntities(String(value)).replace(/\s+/g, " ").trim();
}

function truncate(value, length) {
  if (value.length <= length) return value;
  return `${value.slice(0, length).replace(/\s+\S*$/, "")}…`;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === "number") {
    const milliseconds = value > 1e12 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isExpired(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function inferEmploymentType(value) {
  const text = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  const normalized = text.toLowerCase();
  if (normalized.includes("intern")) return "Internship";
  if (normalized.includes("part")) return "Part time";
  if (
    normalized.includes("contract") ||
    normalized.includes("freelance") ||
    normalized.includes("temporary")
  ) {
    return "Contract";
  }
  if (normalized.includes("full") || normalized.includes("permanent")) {
    return "Full time";
  }
  return "Not specified";
}

function inferExperience(title, seniority) {
  const text = [
    title,
    Array.isArray(seniority) ? seniority.join(" ") : seniority,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(intern|internship|entry|junior|graduate|working student)\b/.test(text)) {
    return "Entry";
  }
  if (/\b(lead|head|director|principal|vp|chief|executive)\b/.test(text)) {
    return "Lead";
  }
  if (/\b(senior|sr)\b/.test(text)) return "Senior";
  if (/\b(mid|intermediate)\b/.test(text)) return "Mid";
  return "Not specified";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatHimalayasSalary(raw) {
  if (!raw.minSalary && !raw.maxSalary) return "";
  const currency = raw.currency ? `${raw.currency} ` : "";
  const period = raw.salaryPeriod ? ` / ${raw.salaryPeriod}` : "";
  if (raw.minSalary && raw.maxSalary) {
    return `${currency}${formatNumber(raw.minSalary)}–${formatNumber(raw.maxSalary)}${period}`;
  }
  const amount = raw.minSalary || raw.maxSalary;
  return `${currency}${formatNumber(amount)}+${period}`;
}

function formatRemoteOkSalary(min, max) {
  if (!min && !max) return "";
  if (min && max) return `$${formatNumber(min)}–$${formatNumber(max)}`;
  return `$${formatNumber(min || max)}+`;
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|gh_src$|lever-source$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value;
  }
}

function fingerprintJob(job) {
  return createHash("sha1")
    .update(
      [job.company, job.title, job.location]
        .map((value) =>
          cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
        )
        .join("|"),
    )
    .digest("hex");
}

function relevanceScore(job) {
  const title = job.title.toLowerCase();
  const categories = job.tags.join(" ").toLowerCase();
  const description = job.description.toLowerCase();
  const excluded =
    EXCLUDED_TITLE_RE.test(title) || EXCLUDED_OPERATIONS_RE.test(title);

  if (excluded) return 0;

  let score = 0;
  if (STRONG_TITLE_RE.test(title)) score += 3;
  if (OPERATIONS_TITLE_RE.test(title)) score += 2;
  if (job.source.id !== "himalayas" && STRONG_CATEGORY_RE.test(categories)) {
    score += 2;
  }
  if (STRONG_DESCRIPTION_RE.test(description)) score += 1;
  return score;
}

function isRelevant(job) {
  return relevanceScore(job) >= 2;
}

function finalizeJob(job) {
  const description = stripHtml(job.description);
  const tags = [...new Set(job.tags.map(cleanText).filter(Boolean))];
  return {
    id: job.id,
    title: cleanText(job.title),
    company: cleanText(job.company),
    location: cleanText(job.location) || "Worldwide",
    workMode: job.workMode,
    employmentType: job.employmentType,
    experience: job.experience,
    salary: job.salary,
    description: truncate(description, 1200),
    descriptionSnippet: truncate(
      cleanText(job.descriptionSnippet) || description,
      240,
    ),
    tags,
    postedAt: job.postedAt,
    expiresAt: job.expiresAt,
    source: {
      id: job.source.id,
      name: job.source.name,
      url: job.source.url,
      termsUrl: job.source.termsUrl,
    },
    sources: [
      {
        id: job.source.id,
        name: job.source.name,
        url: job.source.url,
      },
    ],
    url: job.url,
    applyUrl: job.applyUrl,
    fingerprint: fingerprintJob(job),
  };
}

async function fetchJson(
  url,
  { timeout = REQUEST_TIMEOUT_MS, attempts = 3 } = {},
) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      const retryable =
        !error.status || error.status === 429 || error.status >= 500;
      if (attempt < attempts && retryable) {
        await sleep(attempt * 1000);
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadHimalayas(source) {
  const jobs = [];
  const errors = [];
  let fetched = 0;

  for (const query of source.queries) {
    for (let page = 1; page <= source.maxPages; page += 1) {
      const url = new URL("https://himalayas.app/jobs/api/search");
      url.searchParams.set("q", query);
      url.searchParams.set("worldwide", "true");
      url.searchParams.set("sort", "recent");
      url.searchParams.set("page", String(page));

      try {
        const payload = await fetchJson(url);
        const pageJobs = payload.jobs ?? [];
        fetched += pageJobs.length;

        for (const raw of pageJobs) {
          const job = {
            id: `himalayas:${raw.guid}`,
            title: raw.title,
            company: raw.companyName,
            location:
              raw.locationRestrictions?.length > 0
                ? raw.locationRestrictions.join(", ")
                : "Worldwide",
            workMode: "Remote",
            employmentType: inferEmploymentType(raw.employmentType),
            experience: inferExperience(raw.title, raw.seniority),
            salary: formatHimalayasSalary(raw),
            description: raw.description ?? raw.excerpt ?? "",
            descriptionSnippet: raw.excerpt ?? raw.description ?? "",
            tags: raw.parentCategories ?? [],
            postedAt: toIso(raw.pubDate),
            expiresAt: toIso(raw.expiryDate),
            source: {
              id: source.id,
              name: source.name,
              url: "https://himalayas.app/",
              termsUrl: source.termsUrl,
            },
            url: raw.applicationLink,
            applyUrl: raw.applicationLink,
          };

          if (!job.title || !job.company || !job.applyUrl) continue;
          if (isExpired(job.expiresAt)) continue;
          jobs.push(job);
        }
      } catch (error) {
        errors.push(`${query} page ${page}: ${error.message}`);
      }

      await sleep(REQUEST_DELAY_MS);
    }
  }

  return { jobs, fetched, errors };
}

async function loadRemoteOk(source) {
  const payload = await fetchJson(source.url, { timeout: 90000 });
  const entries = Array.isArray(payload)
    ? payload.filter((entry) => entry.position && entry.company)
    : [];
  const jobs = [];

  for (const raw of entries) {
    const job = {
      id: `remoteok:${raw.id ?? raw.slug}`,
      title: raw.position,
      company: raw.company,
      location: raw.location || "Worldwide",
      workMode: "Remote",
      employmentType: inferEmploymentType(raw.tags),
      experience: inferExperience(raw.position),
      salary: formatRemoteOkSalary(raw.salary_min, raw.salary_max),
      description: raw.description ?? "",
      descriptionSnippet: raw.description ?? "",
      tags: raw.tags ?? [],
      postedAt: toIso(raw.date ?? raw.epoch),
      expiresAt: null,
      source: {
        id: source.id,
        name: source.name,
        url: raw.url,
        termsUrl: source.termsUrl,
      },
      url: raw.url,
      applyUrl: raw.apply_url || raw.url,
    };

    if (!job.title || !job.company || !job.applyUrl) continue;
    jobs.push(job);
  }

  return { jobs, fetched: entries.length, errors: [] };
}

async function loadArbeitnow(source) {
  const jobs = [];
  const errors = [];
  let fetched = 0;
  let nextUrl = source.url;

  for (let page = 1; page <= source.maxPages && nextUrl; page += 1) {
    try {
      const payload = await fetchJson(nextUrl);
      const pageJobs = payload.data ?? [];
      fetched += pageJobs.length;

      for (const raw of pageJobs) {
        if (raw.remote !== true) continue;

        const job = {
          id: `arbeitnow:${raw.slug}`,
          title: raw.title,
          company: raw.company_name,
          location: raw.location || "Worldwide",
          workMode: "Remote",
          employmentType: inferEmploymentType(raw.job_types),
          experience: inferExperience(raw.title),
          salary: "",
          description: raw.description ?? "",
          descriptionSnippet: raw.description ?? "",
          tags: raw.tags ?? [],
          postedAt: toIso(raw.created_at),
          expiresAt: null,
          source: {
            id: source.id,
            name: source.name,
            url: raw.url,
            termsUrl: source.termsUrl,
          },
          url: raw.url,
          applyUrl: raw.url,
        };

        if (!job.title || !job.company || !job.applyUrl) continue;
        jobs.push(job);
      }

      nextUrl = payload.links?.next ?? null;
    } catch (error) {
      errors.push(`page ${page}: ${error.message}`);
      break;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return { jobs, fetched, errors };
}

function mergeJobs(jobs) {
  const byFingerprint = new Map();

  for (const job of jobs) {
    const existing = byFingerprint.get(job.fingerprint);

    if (!existing) {
      byFingerprint.set(job.fingerprint, job);
      continue;
    }

    if (!existing.sources.some((source) => source.id === job.source.id)) {
      existing.sources.push({
        id: job.source.id,
        name: job.source.name,
        url: job.source.url,
      });
    }
    if (!existing.salary && job.salary) existing.salary = job.salary;
    if (!existing.postedAt && job.postedAt) existing.postedAt = job.postedAt;
    if (!existing.expiresAt && job.expiresAt) existing.expiresAt = job.expiresAt;
    if (job.description.length > existing.description.length) {
      existing.description = job.description;
      existing.descriptionSnippet = job.descriptionSnippet;
    }
  }

  return [...byFingerprint.values()];
}

async function main() {
  const config = JSON.parse(await readFile(SOURCES_PATH, "utf8"));
  const sources = config.sources.filter((source) => source.enabled);
  const allJobs = [];
  const sourceStats = [];

  for (const source of sources) {
    try {
      let result;
      if (source.type === "search-api") {
        result = await loadHimalayas(source);
      } else if (source.id === "remoteok") {
        result = await loadRemoteOk(source);
      } else if (source.id === "arbeitnow") {
        result = await loadArbeitnow(source);
      } else {
        continue;
      }

      const relevant = result.jobs.filter(isRelevant);
      allJobs.push(...relevant);
      sourceStats.push({
        id: source.id,
        name: source.name,
        termsUrl: source.termsUrl,
        fetched: result.fetched,
        relevant: relevant.length,
        errors: result.errors,
      });
    } catch (error) {
      sourceStats.push({
        id: source.id,
        name: source.name,
        termsUrl: source.termsUrl,
        fetched: 0,
        relevant: 0,
        errors: [error.message],
      });
    }
  }

  const jobs = mergeJobs(allJobs.map(finalizeJob)).sort((a, b) => {
    const left = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const right = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    return right - left || a.title.localeCompare(b.title);
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    jobCount: jobs.length,
    sources: sourceStats,
    jobs,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(
    `Wrote ${jobs.length} relevant jobs from ${sourceStats.length} sources to public/jobs.json`,
  );
  for (const source of sourceStats) {
    const errorText =
      source.errors.length > 0 ? ` (${source.errors.join("; ")})` : "";
    console.log(
      `- ${source.name}: ${source.fetched} fetched, ${source.relevant} relevant${errorText}`,
    );
  }

  if (jobs.length === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
