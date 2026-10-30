import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CaretDown,
  MagnifyingGlass,
  MapPin,
  Moon,
  Sun,
  X,
} from "@phosphor-icons/react";

function getStoredTheme() {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : null;
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const supportsViewTransitions =
  typeof document !== "undefined" &&
  typeof document.startViewTransition === "function";

function withViewTransition(update) {
  if (
    !supportsViewTransitions ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  document.startViewTransition(() => {
    flushSync(update);
  });
}

const JOB_TYPES = ["Full time", "Part time", "Contract", "Internship"];
const WORK_MODES = ["Any", "Remote", "Hybrid", "On site"];
const EXPERIENCE_LEVELS = ["Any level", "Entry", "Mid", "Senior", "Lead"];
const DATE_POSTED = ["Any time", "Past 24 hours", "Past week", "Past month"];
const JOBS_URL = `${import.meta.env.BASE_URL}jobs.json`;
const INITIAL_FILTERS = {
  location: "",
  types: [],
  mode: "Any",
  experience: "Any level",
  date: "Any time",
};
const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "job",
  "jobs",
  "of",
  "on",
  "remote",
  "role",
  "roles",
  "the",
  "to",
  "with",
]);
const QUERY_SYNONYMS = {
  ops: ["operations", "operational"],
  operations: ["ops", "operational"],
  operational: ["operations", "ops"],
  procurement: ["purchasing", "sourcing"],
  purchasing: ["procurement", "sourcing"],
  sourcing: ["procurement", "purchasing"],
  logistics: ["freight", "supply chain"],
  sop: ["s&op", "sales and operations", "sales operations"],
  inventory: ["stock"],
  warehouse: ["fulfillment"],
  fulfillment: ["warehouse"],
};

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-8 items-center justify-center gap-2 rounded-lg border text-xs font-medium transition-[color,background-color,border-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent active:scale-[0.98] motion-reduce:transition-none ${
        active
          ? "border-accent/45 bg-accent-soft text-accent"
          : "border-line text-muted hover:border-line-strong hover:bg-wash hover:text-ink"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1 rounded-full transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          active ? "bg-accent" : "bg-line-strong"
        }`}
      />
      {children}
    </button>
  );
}

function FilterSelect({ id, ariaLabel, value, onChange, options }) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        className="w-full appearance-none rounded-lg border border-line bg-transparent py-2 pr-8 pl-3 text-sm text-ink outline-none transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-line-strong hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <CaretDown
        aria-hidden="true"
        weight="bold"
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

function FilterSection({ title, count, children }) {
  const [open, setOpen] = useState(true);
  const panelId = `filter-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-center justify-between gap-2 py-3 text-left transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-muted transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:text-ink">
          {title}
          {count > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent tabular-nums">
              {count}
            </span>
          )}
        </span>
        <CaretDown
          aria-hidden="true"
          weight="bold"
          className={`size-4 text-muted transition-[rotate,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:text-ink ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        id={panelId}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function countActiveFilters(filters) {
  return (
    (filters.location.trim() ? 1 : 0) +
    filters.types.length +
    (filters.mode !== "Any" ? 1 : 0) +
    (filters.experience !== "Any level" ? 1 : 0) +
    (filters.date !== "Any time" ? 1 : 0)
  );
}

function JobFilters({ filters, onChange, onReset }) {
  const activeCount = countActiveFilters(filters);

  function toggleType(type) {
    onChange({
      ...filters,
      types: filters.types.includes(type)
        ? filters.types.filter((item) => item !== type)
        : [...filters.types, type],
    });
  }

  const fieldClass =
    "w-full rounded-lg border border-line bg-transparent py-2 pl-8 text-sm text-ink outline-none transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-line-strong hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

  return (
    <div>
      <div className="flex items-center justify-between pb-2 lg:sticky lg:top-0 lg:z-10 lg:bg-canvas">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">Filters</h2>
          {activeCount > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-soft px-2 text-xs font-semibold text-accent tabular-nums">
              {activeCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={activeCount === 0}
          className="text-xs font-medium text-muted transition-[color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 disabled:hover:text-muted motion-reduce:transition-none"
        >
          Reset
        </button>
      </div>

      <div className="divide-y divide-line border-t border-line">
        <FilterSection
          title="Location"
          count={filters.location.trim() ? 1 : 0}
        >
          <div className="relative">
            <MapPin
              aria-hidden="true"
              weight="bold"
              className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted"
            />
            <input
              id="filter-location"
              type="text"
              aria-label="Location"
              value={filters.location}
              onChange={(event) =>
                onChange({ ...filters, location: event.target.value })
              }
              placeholder="City or country"
              className={`${fieldClass} ${
                filters.location ? "pr-8" : "pr-3"
              } placeholder:text-muted`}
            />
            {filters.location && (
              <button
                type="button"
                onClick={() => onChange({ ...filters, location: "" })}
                aria-label="Clear location"
                className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted transition-[color,background-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-wash hover:text-ink active:scale-[0.95] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent motion-reduce:transition-none"
              >
                <X aria-hidden="true" weight="bold" className="size-4" />
              </button>
            )}
          </div>
        </FilterSection>

        <FilterSection title="Job type" count={filters.types.length}>
          <div
            role="group"
            aria-label="Job type"
            className="grid grid-cols-2 gap-2"
          >
            {JOB_TYPES.map((type) => (
              <FilterChip
                key={type}
                active={filters.types.includes(type)}
                onClick={() => toggleType(type)}
              >
                {type}
              </FilterChip>
            ))}
          </div>
        </FilterSection>

        <FilterSection
          title="Work mode"
          count={filters.mode !== "Any" ? 1 : 0}
        >
          <div
            role="group"
            aria-label="Work mode"
            className="grid grid-cols-2 gap-2"
          >
            {WORK_MODES.map((option) => (
              <FilterChip
                key={option}
                active={filters.mode === option}
                onClick={() => onChange({ ...filters, mode: option })}
              >
                {option}
              </FilterChip>
            ))}
          </div>
        </FilterSection>

        <FilterSection
          title="Experience"
          count={filters.experience !== "Any level" ? 1 : 0}
        >
          <FilterSelect
            id="filter-experience"
            ariaLabel="Experience"
            value={filters.experience}
            onChange={(event) =>
              onChange({ ...filters, experience: event.target.value })
            }
            options={EXPERIENCE_LEVELS}
          />
        </FilterSection>

        <FilterSection
          title="Date posted"
          count={filters.date !== "Any time" ? 1 : 0}
        >
          <FilterSelect
            id="filter-date"
            ariaLabel="Date posted"
            value={filters.date}
            onChange={(event) =>
              onChange({ ...filters, date: event.target.value })
            }
            options={DATE_POSTED}
          />
        </FilterSection>
      </div>
    </div>
  );
}

function SiteNav({ themeToggle }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const menuPanelRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = [
      document.getElementById("skip-link"),
      document.getElementById("main"),
    ].filter(Boolean);
    background.forEach((element) => element.setAttribute("inert", ""));
    const focusTimer = window.setTimeout(
      () => menuPanelRef.current?.querySelector("button, a[href]")?.focus(),
      50,
    );

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    const desktop = window.matchMedia("(min-width: 768px)");
    function handleDesktop(event) {
      if (event.matches) setMenuOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    desktop.addEventListener("change", handleDesktop);

    return () => {
      document.body.style.overflow = originalOverflow;
      background.forEach((element) => element.removeAttribute("inert"));
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      desktop.removeEventListener("change", handleDesktop);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
        <nav
          aria-label="Primary"
          className="pointer-events-auto mx-auto mt-6 flex w-max max-w-[calc(100%-48px)] items-center gap-2 rounded-full border border-line bg-surface/80 p-2 backdrop-blur-xl"
        >
          <a
            href="#main"
            aria-label="Khoj home"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-full px-2 py-1 text-sm font-semibold text-ink transition-[color,background-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-wash active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-ink text-canvas">
              <MagnifyingGlass
                aria-hidden="true"
                weight="bold"
                className="size-4"
              />
            </span>
            Khoj
          </a>

          <div className="hidden md:block">{themeToggle}</div>

          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((value) => !value)}
            className="relative flex size-10 items-center justify-center rounded-full text-ink transition-[background-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-wash active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none md:hidden"
          >
            <span
              aria-hidden="true"
              className={`absolute h-0.5 w-4 rounded-full bg-ink transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
                menuOpen ? "rotate-45" : "-translate-y-1"
              }`}
            />
            <span
              aria-hidden="true"
              className={`absolute h-0.5 w-4 rounded-full bg-ink transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
                menuOpen ? "-rotate-45" : "translate-y-1"
              }`}
            />
          </button>
        </nav>
      </header>

      <div
        id="site-menu"
        inert={!menuOpen}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setMenuOpen(false);
            menuButtonRef.current?.focus();
          }
        }}
        className={`fixed inset-0 z-40 flex flex-col justify-center gap-2 bg-white/80 px-6 backdrop-blur-3xl transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none dark:bg-black/80 md:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          ref={menuPanelRef}
          className="mx-auto flex w-full max-w-[680px] items-center gap-3"
        >
          {themeToggle}
          <p className="text-sm text-muted">Every job, one search.</p>
        </div>
      </div>
    </>
  );
}

function Landing({ themeToggle, showRise, heroForm }) {
  return (
    <>
      <SiteNav themeToggle={themeToggle} />

      <main id="main" className="relative z-10">
        <section className="flex min-h-dvh items-center justify-center px-6 pt-24 pb-20 sm:px-8">
          <div className="w-full max-w-[680px] text-center">
            <h1
              className={`hero-title ${
                showRise ? "rise " : ""
              }text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl`}
            >
              Every job,
              <br />
              one search.
            </h1>
            <p
              className={`${
                showRise ? "rise rise-1 " : ""
              }mx-auto mt-3 max-w-[680px] text-base text-pretty text-muted`}
            >
              We read job boards, company pages, and listings, then return the
              openings that match your search.
            </p>

            {heroForm}
            <p
              className={`${
                showRise ? "rise rise-2 " : ""
              }mt-4 text-xs text-pretty text-muted`}
            >
              Public listings only. No account needed.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

function tokenizeQuery(query) {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/s\s*&\s*op\b/g, "sop")
        .split(/[^a-z0-9]+/)
        .filter(
          (token) => token.length > 1 && !QUERY_STOP_WORDS.has(token),
        ),
    ),
  ];
}

function tokenMatches(haystack, token) {
  if (haystack.includes(token)) return true;
  return (QUERY_SYNONYMS[token] ?? []).some((synonym) =>
    haystack.includes(synonym),
  );
}

function scoreJob(job, tokens) {
  if (tokens.length === 0) return 1;

  const title = job.title.toLowerCase();
  const company = job.company.toLowerCase();
  const tags = (job.tags ?? []).join(" ").toLowerCase();
  const description =
    `${job.description ?? ""} ${job.descriptionSnippet ?? ""}`.toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (tokenMatches(title, token)) {
      score += 6;
    } else if (tokenMatches(tags, token)) {
      score += 3;
    } else if (tokenMatches(company, token)) {
      score += 2;
    } else if (tokenMatches(description, token)) {
      score += 1;
    } else {
      return 0;
    }
  }
  return score;
}

function matchesFilters(job, filters) {
  const location = filters.location.trim().toLowerCase();
  if (location && !job.location.toLowerCase().includes(location)) return false;
  if (
    filters.types.length > 0 &&
    !filters.types.includes(job.employmentType)
  ) {
    return false;
  }
  if (filters.mode !== "Any" && job.workMode !== filters.mode) return false;
  if (
    filters.experience !== "Any level" &&
    job.experience !== filters.experience
  ) {
    return false;
  }
  if (filters.date !== "Any time") {
    if (!job.postedAt) return false;
    const posted = new Date(job.postedAt).getTime();
    const days = {
      "Past 24 hours": 1,
      "Past week": 7,
      "Past month": 30,
    }[filters.date];
    if (Date.now() - posted > days * 86400000) return false;
  }
  return true;
}

function searchJobs(jobs, query, filters) {
  const tokens = tokenizeQuery(query);

  return jobs
    .filter((job) => matchesFilters(job, filters))
    .map((job) => ({ job, score: scoreJob(job, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      const left = a.job.postedAt ? new Date(a.job.postedAt).getTime() : 0;
      const right = b.job.postedAt ? new Date(b.job.postedAt).getTime() : 0;
      return b.score - a.score || right - left;
    })
    .map((entry) => entry.job);
}

function formatPostedAt(value) {
  if (!value) return "Date not listed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not listed";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatIndexDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function JobCard({ job }) {
  const applyUrl = job.applyUrl || job.url;
  const source = job.source ?? job.sources?.[0];
  const extraSources = Math.max(0, (job.sources?.length ?? 1) - 1);
  const tags = (job.tags ?? []).filter(Boolean).slice(0, 3);

  return (
    <article className="rounded-xl border border-line bg-surface p-4 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-line-strong sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-balance text-ink">
            <a
              href={applyUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              {job.title}
            </a>
          </h2>
          <p className="mt-1 truncate text-sm text-muted">
            {job.company} · {job.location}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-wash px-2 py-1 text-xs font-medium text-muted">
          {job.workMode}
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-pretty text-muted">
        {job.descriptionSnippet}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {job.employmentType !== "Not specified" && (
          <span className="rounded-full bg-wash px-2 py-1 text-xs text-muted">
            {job.employmentType}
          </span>
        )}
        {job.experience !== "Not specified" && (
          <span className="rounded-full bg-wash px-2 py-1 text-xs text-muted">
            {job.experience}
          </span>
        )}
        {job.salary && (
          <span className="rounded-full bg-wash px-2 py-1 text-xs text-muted">
            {job.salary}
          </span>
        )}
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-wash px-2 py-1 text-xs text-muted"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <a
          href={source?.url}
          target="_blank"
          rel="noreferrer"
          className="rounded text-xs font-medium text-muted transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          via {source?.name}
          {extraSources > 0 ? ` +${extraSources}` : ""}
        </a>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {formatPostedAt(job.postedAt)}
          </span>
          <a
            href={applyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded text-sm font-medium text-ink transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            View job
            <ArrowUpRight aria-hidden="true" weight="bold" className="size-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading jobs">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="skeleton rounded-xl border border-line bg-surface p-4"
        >
          <div className="h-4 w-2/5 rounded bg-wash" />
          <div className="mt-3 h-3 w-1/4 rounded bg-wash" />
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-16 rounded-full bg-wash" />
            <div className="h-6 w-20 rounded-full bg-wash" />
            <div className="h-6 w-12 rounded-full bg-wash" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const initialQuery =
    new URLSearchParams(window.location.search).get("q") ?? "";
  const [theme, setTheme] = useState(() => getStoredTheme() ?? getSystemTheme());
  const [query, setQuery] = useState(initialQuery);
  const [routeQuery, setRouteQuery] = useState(initialQuery);
  const [hasNavigated, setHasNavigated] = useState(false);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [jobs, setJobs] = useState([]);
  const [jobsStatus, setJobsStatus] = useState("loading");
  const [jobsError, setJobsError] = useState("");
  const [jobsUpdatedAt, setJobsUpdatedAt] = useState("");
  const [jobsReloadKey, setJobsReloadKey] = useState(0);
  const [searchError, setSearchError] = useState(null);
  const inputRef = useRef(null);

  const queryRef = useRef(query);

  queryRef.current = query;
  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", isDark ? "#000000" : "#fafaf9");
  }, [isDark]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event) => {
      if (!getStoredTheme()) {
        setTheme(event.matches ? "dark" : "light");
      }
    };

    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!routeQuery && window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [routeQuery]);

  useEffect(() => {
    function handleKeyDown(event) {
      const menu = document.getElementById("site-menu");
      if (menu && !menu.hasAttribute("inert")) return;

      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (
        event.key === "Escape" &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches('input[name="q"]')
      ) {
        if (queryRef.current) {
          event.preventDefault();
          setQuery("");
        } else {
          document.activeElement.blur();
        }
        return;
      }

      if (
        event.key === "/" &&
        !isEditable &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setJobsStatus("loading");
    setJobsError("");

    fetch(JOBS_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load jobs (${response.status})`);
        }
        return response.json();
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
        setJobsUpdatedAt(payload.generatedAt ?? "");
        setJobsStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === "AbortError") return;
        setJobsError(error.message);
        setJobsStatus("error");
      });

    return () => controller.abort();
  }, [jobsReloadKey]);

  useEffect(() => {
    function handlePopState() {
      const next = new URLSearchParams(window.location.search).get("q");

      withViewTransition(() => {
        setRouteQuery(next ?? "");
        setHasNavigated(true);
        setSearchError(null);

        if (next) {
          setQuery(next);
        } else {
          setQuery("");
          setFilters({ ...INITIAL_FILTERS, types: [] });
        }
      });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark";
    localStorage.setItem("theme", nextTheme);
    setTheme(nextTheme);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const value = query.trim();
    if (!value) {
      const field = event.currentTarget.querySelector('input[name="q"]');
      setSearchError({
        id: field?.id,
        message: "Enter a role, company, or skill to search.",
      });
      field?.focus();
      return;
    }

    setSearchError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("q", value);

    withViewTransition(() => {
      window.history.pushState({ q: value }, "", url);
      setQuery(value);
      setRouteQuery(value);
      setHasNavigated(true);
    });
  }

  function resetSearch() {
    withViewTransition(() => {
      window.history.pushState({}, "", "/");
      setRouteQuery("");
      setQuery("");
      setSearchError(null);
      setFilters({ ...INITIAL_FILTERS, types: [] });
      setHasNavigated(true);
    });

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  function retryJobs() {
    setJobsReloadKey((value) => value + 1);
  }

  const filteredJobs = useMemo(
    () => searchJobs(jobs, routeQuery, filters),
    [jobs, routeQuery, filters],
  );
  const resultSourceCount = useMemo(
    () =>
      new Set(
        filteredJobs.flatMap((job) =>
          (job.sources ?? [job.source]).map((source) => source.id),
        ),
      ).size,
    [filteredJobs],
  );
  const activeFilterCount = countActiveFilters(filters);
  const isResults = Boolean(routeQuery);
  const showRise = !hasNavigated || !supportsViewTransitions;

  function renderSearchForm({
    id,
    fieldRef,
    showHint = false,
    showButton = false,
    formClassName = "",
    shellClassName = "search-field",
  }) {
    return (
      <form
        onSubmit={handleSubmit}
        role="search"
        className={formClassName}
      >
        <label htmlFor={id} className="sr-only">
          Search jobs
        </label>
        <div
          className={`${shellClassName} group flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-3 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-line-strong sm:h-16 sm:gap-3 sm:px-4`}
        >
          <MagnifyingGlass
            aria-hidden="true"
            weight="bold"
            className="pointer-events-none size-6 shrink-0 text-muted transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-focus-within:text-accent motion-reduce:transition-none"
          />
          <input
            ref={fieldRef}
            id={id}
            name="q"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (searchError) setSearchError(null);
            }}
            aria-invalid={searchError?.id === id ? "true" : undefined}
            aria-describedby={
              searchError?.id === id ? `${id}-error` : undefined
            }
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Search roles, companies, skills"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
          {showHint && (
            <kbd
              aria-hidden="true"
              className="hidden h-6 shrink-0 items-center rounded border border-line bg-surface-2 px-2 text-xs text-muted transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-focus-within:opacity-0 sm:flex"
            >
              /
            </kbd>
          )}
          {showButton && (
            <button
              type="submit"
              className="h-10 shrink-0 rounded bg-ink px-3 text-base font-semibold text-canvas transition-[background-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ink/90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              Search
            </button>
          )}
        </div>
        {searchError?.id === id && (
          <p
            id={`${id}-error`}
            role="alert"
            className="mt-2 text-xs text-pretty text-red-600 dark:text-red-400"
          >
            {searchError.message}
          </p>
        )}
      </form>
    );
  }

  const heroForm = renderSearchForm({
    id: "search-input",
    fieldRef: inputRef,
    showHint: true,
    showButton: true,
    formClassName: `${
      showRise ? "rise rise-2 " : ""
    }relative mt-8 sm:mt-10`,
    shellClassName: "search-field search-shell",
  });

  const resultsForm = renderSearchForm({
    id: "search-input",
    fieldRef: inputRef,
    formClassName: "relative w-full",
    shellClassName: "search-field search-shell",
  });

  const themeToggle = (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      className="relative inline-flex h-10 w-20 shrink-0 items-center rounded-full border border-line bg-track p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] transition-[color,background-color,border-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-line-strong active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)]"
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 left-1 h-8 w-8 rounded-full bg-thumb shadow-[0_1px_2px_rgb(0_0_0/0.12),0_3px_8px_-2px_rgb(0_0_0/0.1)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none dark:shadow-[0_1px_2px_rgb(0_0_0/0.5)] ${
          isDark ? "translate-x-10" : "translate-x-0"
        }`}
      />
      <span className="relative z-10 flex flex-1 items-center justify-center">
        <Sun
          aria-hidden="true"
          weight="bold"
          className={`size-4 transition-[rotate,scale,color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
            isDark
              ? "rotate-90 scale-75 text-muted"
              : "rotate-0 scale-100 text-amber-600"
          }`}
        />
      </span>
      <span className="relative z-10 flex flex-1 items-center justify-center">
        <Moon
          aria-hidden="true"
          weight="bold"
          className={`size-4 transition-[rotate,scale,color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
            isDark
              ? "rotate-0 scale-100 text-accent"
              : "-rotate-90 scale-75 text-muted"
          }`}
        />
      </span>
    </button>
  );

  const resultsPanel = isResults && (
    <section aria-label="Results" className="mt-6">
      {jobsStatus === "loading" && <ResultsSkeleton />}

      {jobsStatus === "error" && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-base font-semibold text-balance text-ink">
            Couldn't load jobs
          </h2>
          <p className="mt-1 max-w-md text-sm text-pretty text-muted">
            {jobsError || "The job index is unavailable right now."}
          </p>
          <button
            type="button"
            onClick={retryJobs}
            className="mt-4 inline-flex items-center rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-[color,background-color,border-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-line-strong hover:bg-wash active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            Try again
          </button>
        </div>
      )}

      {jobsStatus === "ready" && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">
                {filteredJobs.length}{" "}
                {filteredJobs.length === 1 ? "job" : "jobs"} matching{" "}
                <span className="font-medium text-ink">“{routeQuery}”</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {resultSourceCount}{" "}
                {resultSourceCount === 1 ? "source" : "sources"}
                {jobsUpdatedAt
                  ? ` · updated ${formatIndexDate(jobsUpdatedAt)}`
                  : ""}
              </p>
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => setFilters({ ...INITIAL_FILTERS, types: [] })}
                className="text-xs font-medium text-muted transition-[color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                Clear filters
              </button>
            )}
          </div>

          {filteredJobs.length > 0 ? (
            <div className="mt-4 space-y-3">
              {filteredJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-line bg-surface p-6">
              <MagnifyingGlass
                aria-hidden="true"
                weight="bold"
                className="size-6 text-muted"
              />
              <h2 className="mt-4 text-base font-semibold text-balance text-ink">
                {jobs.length === 0
                  ? "No listings are available yet"
                  : "No jobs match that search"}
              </h2>
              <p className="mt-1 max-w-md text-sm text-pretty text-muted">
                {jobs.length === 0
                  ? "The public index is empty right now. Try again later."
                  : "Try a broader role, another location, or clear filters."}
              </p>
              <button
                type="button"
                onClick={
                  activeFilterCount > 0
                    ? () => setFilters({ ...INITIAL_FILTERS, types: [] })
                    : retryJobs
                }
                className="mt-4 inline-flex items-center rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-[color,background-color,border-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-line-strong hover:bg-wash active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                {activeFilterCount > 0 ? "Clear filters" : "Reload jobs"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );

  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas text-ink">
      <a
        id="skip-link"
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Skip to content
      </a>

      {isResults ? (
        <div className="relative z-10 flex flex-1 flex-col lg:block">
          <aside className="contents lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-1/4 lg:flex-col lg:border-r lg:border-line lg:bg-canvas">
            <div className="order-1 flex h-24 items-center gap-3 px-6 sm:px-8 lg:order-none lg:block lg:h-auto lg:px-6 lg:py-4">
              <button
                type="button"
                onClick={resetSearch}
                aria-label="Back to search"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-[color,background-color,border-color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-line-strong hover:bg-wash hover:text-ink active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none lg:hidden"
              >
                <ArrowLeft aria-hidden="true" weight="bold" className="size-4" />
              </button>
              <div className="min-w-0 flex-1">{resultsForm}</div>
              <div className="lg:hidden">{themeToggle}</div>
            </div>
            <div className="order-3 border-t border-line px-6 pb-6 pt-6 sm:px-8 lg:order-none lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-6">
              <JobFilters
                filters={filters}
                onChange={setFilters}
                onReset={() => setFilters({ ...INITIAL_FILTERS, types: [] })}
              />
            </div>
          </aside>

          <div className="order-2 lg:ml-[25%]">
            <div className="hidden h-24 items-center justify-between px-8 lg:flex">
              <button
                type="button"
                onClick={resetSearch}
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-muted transition-[color,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ink active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                <ArrowLeft aria-hidden="true" weight="bold" className="size-4" />
                Back to search
              </button>
              {themeToggle}
            </div>
            <main id="main" className="px-6 pt-6 pb-24 sm:px-8 lg:px-8 lg:pb-16">
              <div className="mx-auto w-full max-w-3xl">
                <h1 className="sr-only">
                  Search results for “{routeQuery}”
                </h1>
                {resultsPanel}
              </div>
            </main>
          </div>
        </div>
      ) : (
        <Landing
          themeToggle={themeToggle}
          showRise={showRise}
          heroForm={heroForm}
        />
      )}
    </div>
  );
}
