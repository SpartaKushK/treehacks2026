/**
 * Clinical Evidence Service
 *
 * Queries PubMed (NCBI E-utilities) and openFDA for clinical evidence
 * relevant to detected health anomalies. Returns structured evidence
 * with citations that can be used by the secretary agent, shown to
 * patients, and displayed on the evidence dashboard.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ClinicalStudy {
  title: string;
  authors: string;
  pmid: string;
  abstract: string;
  url: string;
  journal: string;
  year: string;
  relevance: string;
}

export interface DrugInteraction {
  drug: string;
  warning: string;
  severity: "low" | "moderate" | "high";
  source: string;
}

export interface ClinicalGuideline {
  condition: string;
  recommendation: string;
  source: string;
  url: string;
}

export interface ClinicalEvidence {
  studies: ClinicalStudy[];
  drugInteractions: DrugInteraction[];
  guidelines: ClinicalGuideline[];
  patientFriendlySummary: string;
  queriedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Flag → Search Query Mapping                                        */
/* ------------------------------------------------------------------ */

const FLAG_SEARCH_TERMS: Record<string, string> = {
  RHR_SPIKE: "elevated resting heart rate tachycardia risk",
  SLEEP_DROP: "sleep deprivation cardiovascular health outcomes",
  HRV_DROP: "heart rate variability decrease autonomic dysfunction",
  LOW_STEPS: "physical inactivity sedentary behavior health risk",
  HIGH_SYMPTOM: "symptom burden chronic disease management",
  MED_NONADHERENCE: "medication nonadherence outcomes risk",
};

/* ------------------------------------------------------------------ */
/*  Flag → Clinical Guidelines Mapping                                 */
/* ------------------------------------------------------------------ */

const FLAG_GUIDELINES: Record<string, ClinicalGuideline[]> = {
  RHR_SPIKE: [
    {
      condition: "Elevated Resting Heart Rate",
      recommendation:
        "A resting heart rate consistently above 100 bpm (tachycardia) warrants medical evaluation. " +
        "The AHA recommends a normal resting HR of 60-100 bpm. Persistent elevation may indicate " +
        "dehydration, stress, anemia, thyroid issues, or cardiac conditions.",
      source: "American Heart Association (AHA)",
      url: "https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse",
    },
  ],
  SLEEP_DROP: [
    {
      condition: "Insufficient Sleep Duration",
      recommendation:
        "Adults should sleep 7-9 hours per night. Sleeping less than 6 hours is associated with " +
        "increased risk of cardiovascular disease, obesity, and impaired immune function. " +
        "The CDC recommends consulting a healthcare provider if sleep problems persist.",
      source: "CDC / National Sleep Foundation",
      url: "https://www.cdc.gov/sleep/about/index.html",
    },
  ],
  HRV_DROP: [
    {
      condition: "Decreased Heart Rate Variability",
      recommendation:
        "Reduced HRV is associated with increased cardiovascular risk and autonomic nervous system " +
        "imbalance. The European Society of Cardiology notes that low HRV may predict adverse " +
        "cardiac events. Stress management and regular exercise may help improve HRV.",
      source: "European Society of Cardiology (ESC)",
      url: "https://www.escardio.org",
    },
  ],
  LOW_STEPS: [
    {
      condition: "Physical Inactivity",
      recommendation:
        "The WHO recommends at least 150-300 minutes of moderate-intensity aerobic activity per week. " +
        "Prolonged sedentary behavior increases risk of cardiovascular disease, type 2 diabetes, " +
        "and premature mortality.",
      source: "World Health Organization (WHO)",
      url: "https://www.who.int/news-room/fact-sheets/detail/physical-activity",
    },
  ],
  MED_NONADHERENCE: [
    {
      condition: "Medication Non-Adherence",
      recommendation:
        "Medication adherence below 80% is associated with poorer health outcomes. " +
        "The WHO estimates that adherence to long-term therapies averages only 50% in developed " +
        "countries. Strategies include simplifying regimens and using reminder systems.",
      source: "World Health Organization (WHO)",
      url: "https://www.who.int/chp/knowledge/publications/adherence_report/en/",
    },
  ],
};

/* ------------------------------------------------------------------ */
/*  In-Memory Cache                                                    */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { data: ClinicalEvidence; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(flags: string[]): string {
  return [...flags].sort().join(",");
}

/* ------------------------------------------------------------------ */
/*  PubMed E-utilities                                                 */
/* ------------------------------------------------------------------ */

async function searchPubMed(query: string, maxResults = 5): Promise<ClinicalStudy[]> {
  try {
    // Step 1: esearch to get PMIDs
    const searchUrl =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` +
      `?db=pubmed&retmode=json&retmax=${maxResults}&sort=relevance` +
      `&term=${encodeURIComponent(query)}`;

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const pmids: string[] = searchData?.esearchresult?.idlist ?? [];
    if (pmids.length === 0) return [];

    // Step 2: efetch to get article details
    const fetchUrl =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi` +
      `?db=pubmed&retmode=json&id=${pmids.join(",")}`;

    const fetchRes = await fetch(fetchUrl);
    if (!fetchRes.ok) return [];
    const fetchData = await fetchRes.json();
    const results = fetchData?.result ?? {};

    const studies: ClinicalStudy[] = [];
    for (const pmid of pmids) {
      const article = results[pmid];
      if (!article || article.error) continue;
      studies.push({
        title: article.title || "Untitled",
        authors: (article.authors || [])
          .slice(0, 3)
          .map((a: { name: string }) => a.name)
          .join(", ") + (article.authors?.length > 3 ? " et al." : ""),
        pmid,
        abstract: article.sortfirstauthor
          ? `Study by ${article.sortfirstauthor} published in ${article.source || "journal"}.`
          : "",
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        journal: article.source || "Unknown Journal",
        year: article.pubdate?.split(" ")[0] || "Unknown",
        relevance: query,
      });
    }
    return studies;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  openFDA Drug Interactions                                          */
/* ------------------------------------------------------------------ */

async function queryOpenFDA(medications: string[]): Promise<DrugInteraction[]> {
  if (!medications || medications.length === 0) return [];

  const interactions: DrugInteraction[] = [];

  for (const drug of medications.slice(0, 3)) {
    try {
      const url =
        `https://api.fda.gov/drug/event.json` +
        `?search=patient.drug.medicinalproduct:"${encodeURIComponent(drug)}"` +
        `&limit=3`;

      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const results = data?.results ?? [];

      for (const event of results) {
        const reactions = (event.patient?.reaction || [])
          .slice(0, 2)
          .map((r: { reactionmeddrapt: string }) => r.reactionmeddrapt)
          .join(", ");

        if (reactions) {
          interactions.push({
            drug,
            warning: `Reported adverse events: ${reactions}`,
            severity: event.serious === "1" ? "high" : "moderate",
            source: "FDA Adverse Event Reporting System (FAERS)",
          });
        }
      }
    } catch {
      // Skip failed drug lookups
    }
  }

  return interactions;
}

/* ------------------------------------------------------------------ */
/*  Build Patient-Friendly Summary                                     */
/* ------------------------------------------------------------------ */

function buildPatientSummary(
  flags: string[],
  studies: ClinicalStudy[],
  guidelines: ClinicalGuideline[],
): string {
  const parts: string[] = [];

  if (guidelines.length > 0) {
    parts.push(
      "Based on your health data, here is what clinical guidelines say:"
    );
    for (const g of guidelines) {
      parts.push(`- ${g.condition}: ${g.recommendation} (Source: ${g.source})`);
    }
  }

  if (studies.length > 0) {
    parts.push(
      `\nWe found ${studies.length} relevant medical ${studies.length === 1 ? "study" : "studies"} that may help your care team understand your situation better.`
    );
  }

  if (parts.length === 0) {
    parts.push(
      "Your health data has been recorded. Please follow up with your healthcare provider for personalized guidance."
    );
  }

  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Main Entry Point                                                   */
/* ------------------------------------------------------------------ */

export async function lookupClinicalEvidence(params: {
  flags: string[];
  metrics?: Record<string, unknown>;
  medications?: string[];
}): Promise<ClinicalEvidence> {
  const { flags, medications } = params;

  // Check cache
  const key = cacheKey(flags);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  // Build search queries from flags
  const searchTerms = flags
    .map((f) => FLAG_SEARCH_TERMS[f])
    .filter(Boolean);

  // If no recognized flags, use a generic query
  if (searchTerms.length === 0) {
    searchTerms.push("wearable health monitoring clinical significance");
  }

  // Query PubMed for each set of search terms (in parallel, with small delay for rate limiting)
  const studyPromises = searchTerms.map((term, i) =>
    new Promise<ClinicalStudy[]>((resolve) =>
      setTimeout(() => searchPubMed(term, 3).then(resolve).catch(() => resolve([])), i * 350)
    )
  );

  // Query openFDA for drug interactions
  const drugPromise = queryOpenFDA(medications || []);

  const [studyResults, drugInteractions] = await Promise.all([
    Promise.all(studyPromises),
    drugPromise,
  ]);

  // Flatten and dedupe studies by PMID
  const seenPmids = new Set<string>();
  const studies: ClinicalStudy[] = [];
  for (const batch of studyResults) {
    for (const study of batch) {
      if (!seenPmids.has(study.pmid)) {
        seenPmids.add(study.pmid);
        studies.push(study);
      }
    }
  }

  // Collect guidelines for detected flags
  const guidelines: ClinicalGuideline[] = [];
  for (const flag of flags) {
    const flagGuidelines = FLAG_GUIDELINES[flag];
    if (flagGuidelines) {
      guidelines.push(...flagGuidelines);
    }
  }

  const patientFriendlySummary = buildPatientSummary(flags, studies, guidelines);

  const evidence: ClinicalEvidence = {
    studies,
    drugInteractions,
    guidelines,
    patientFriendlySummary,
    queriedAt: new Date().toISOString(),
  };

  // Cache the result
  cache.set(key, { data: evidence, ts: Date.now() });

  return evidence;
}
