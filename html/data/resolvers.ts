// resolvers.ts — Cross-data-source join functions for the EDU Reference Library.
// These read spec/use-case data from Pinia stores and join with CEDS alignment data.

import { useKnowledgeStore } from '@/stores/knowledgeStore';
import { cedsAlignmentMatrix, cedsDomains } from './ceds-alignment';
import { stakeholderTaxonomy, useCasesCedsRdf } from './taxonomies';
import { fieldMappings } from './field-mappings';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AlignmentStatus = 'full' | 'partial' | 'gap';

export interface ScoredStandard {
  entry: any;
  score: number;
  fullCount: number;
  partialCount: number;
  matchedDomains: { domain: string; status: AlignmentStatus }[];
}

export interface StandardObject {
  element: string;
  domain: string;
  domainLabel: string;
  status: AlignmentStatus;
  notes: string;
  gapNotes: string | null;
}

// ─── Burden ordering ────────────────────────────────────────────────────────

const burdenOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };

// ─── Domain label lookup ────────────────────────────────────────────────────

const domainLabelMap = Object.fromEntries(cedsDomains.map(d => [d.id, d.label]));
const domainIconMap = Object.fromEntries(cedsDomains.map(d => [d.id, d.icon]));

export function getDomainLabel(domainId: string): string {
  return domainLabelMap[domainId] || domainId;
}

export function getDomainIcon(domainId: string): string {
  return domainIconMap[domainId] || '';
}

// ─── Standard lookups (from store) ──────────────────────────────────────────

export function getStandardById(standardId: string) {
  return useKnowledgeStore().specById(standardId) || null;
}

export function getAllStandards() {
  return useKnowledgeStore().specs;
}

export function getStandardsByCategory() {
  return useKnowledgeStore().specsByCategory;
}

// ─── Standards scored for a use case ────────────────────────────────────────

export function getStandardsForUseCase(useCaseId: string): ScoredStandard[] {
  const ucStore = useKnowledgeStore();
  const uc = ucStore.useCaseById(useCaseId);
  const domains = uc?.cedsDomains;
  if (!domains || domains.length === 0) return [];
  return scoreStandardsByDomains(new Set(domains));
}

export function getStandardsForDomains(domainIds: string[]): ScoredStandard[] {
  return scoreStandardsByDomains(new Set(domainIds));
}

function scoreStandardsByDomains(relevantDomains: Set<string>): ScoredStandard[] {
  const specStore = useKnowledgeStore();
  const scored: ScoredStandard[] = [];

  for (const entry of specStore.specs) {
    const alignment = cedsAlignmentMatrix.find(a => a.entryId === entry.id);
    if (!alignment) continue;

    let fullCount = 0;
    let partialCount = 0;
    const matchedDomains: { domain: string; status: AlignmentStatus }[] = [];

    for (const domain of relevantDomains) {
      const domainData = (alignment.domains as Record<string, { status: string; cedsElements?: string[]; notes?: string; gapNotes?: string | null }>)[domain];
      if (domainData) {
        if (domainData.status === 'full') {
          fullCount++;
          matchedDomains.push({ domain, status: 'full' });
        } else if (domainData.status === 'partial') {
          partialCount++;
          matchedDomains.push({ domain, status: 'partial' });
        }
      }
    }

    const score = fullCount * 2 + partialCount;
    if (score === 0) continue;

    scored.push({ entry, score, fullCount, partialCount, matchedDomains });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (burdenOrder[a.entry.implementationBurden] || 0) - (burdenOrder[b.entry.implementationBurden] || 0);
  });

  return scored;
}

// ─── Use case lookups (from store) ──────────────────────────────────────────

export function getUseCaseById(useCaseId: string) {
  const ucStore = useKnowledgeStore();
  const uc = ucStore.useCaseById(useCaseId);
  if (!uc) return null;
  // Enrich with taxonomy labels
  for (const topic of ucStore.taxonomy) {
    for (const driver of topic.children) {
      if (driver.children.includes(uc.id)) {
        return {
          ...uc,
          label: uc.title,
          categoryId: topic.id,
          categoryLabel: topic.label,
          categoryIcon: topic.icon,
          categoryColor: topic.color,
          subcategoryId: driver.id,
          subcategoryLabel: driver.label,
          cedsDomains: uc.cedsDomains || [],
        };
      }
    }
  }
  return { ...uc, label: uc.title, cedsDomains: uc.cedsDomains || [] };
}

export function getAllUseCasesFlat() {
  const ucStore = useKnowledgeStore();
  return ucStore.useCases.map(uc => {
    // Find taxonomy context
    for (const topic of ucStore.taxonomy) {
      for (const driver of topic.children) {
        if (driver.children.includes(uc.id)) {
          return {
            ...uc,
            label: uc.title,
            categoryId: topic.id,
            categoryLabel: topic.label,
            categoryIcon: topic.icon,
            categoryColor: topic.color,
            subcategoryId: driver.id,
            subcategoryLabel: driver.label,
          };
        }
      }
    }
    return { ...uc, label: uc.title };
  });
}

export function getUseCasesForStandard(standardId: string) {
  const ucStore = useKnowledgeStore();

  // Find use cases where the standard's aligned CEDS domains overlap
  const alignment = cedsAlignmentMatrix.find(a => a.entryId === standardId);
  if (!alignment) return [];

  const standardDomains = new Set<string>();
  for (const [domainId, data] of Object.entries(alignment.domains)) {
    if ((data as { status: string }).status === 'full' || (data as { status: string }).status === 'partial') {
      standardDomains.add(domainId);
    }
  }

  // Also check useCasesCedsRdf for related standards
  const fromRdf = useCasesCedsRdf
    .filter(uc => uc.relatedStandards?.includes(standardId.replace('lrw-competency-framework', 'ler-framework').replace('case-v1', 'case-framework').replace('open-badges-v3', 'open-badges').replace('clr-v2', 'clr')))
    .map(uc => ({
      id: uc.id,
      label: uc.label,
      icon: uc.icon,
      description: uc.description,
    }));

  // From store: use cases whose CEDS domains overlap with this standard
  const fromStore = ucStore.useCases.filter(uc => {
    if (!uc.cedsDomains?.length) return false;
    return uc.cedsDomains.some(d => standardDomains.has(d));
  });

  // Merge and deduplicate
  const seen = new Set<string>();
  const result: Array<{ id: string; label: string; icon?: string; description?: string; source: string }> = [];

  for (const uc of fromRdf) {
    if (!seen.has(uc.id)) {
      seen.add(uc.id);
      result.push({ ...uc, source: 'rdf' });
    }
  }
  for (const uc of fromStore) {
    if (!seen.has(uc.id)) {
      seen.add(uc.id);
      result.push({ id: uc.id, label: uc.title, source: 'store' });
    }
  }

  return result;
}

// ─── Driver (stakeholder) lookups ───────────────────────────────────────────

export function getDriverById(driverId: string) {
  return stakeholderTaxonomy.find(g => g.id === driverId) || null;
}

export function getStakeholderById(stakeholderId: string) {
  for (const group of stakeholderTaxonomy) {
    for (const child of group.children) {
      if (child.id === stakeholderId) {
        return { ...child, groupId: group.id, groupLabel: group.label, groupIcon: group.icon };
      }
    }
  }
  return null;
}

export function getUseCasesForDriver(driverId: string) {
  const group = stakeholderTaxonomy.find(g => g.id === driverId);
  if (!group) return [];

  const stakeholderIds = group.children.map(c => c.id);

  // Find use cases from useCasesCedsRdf that reference these stakeholders
  return useCasesCedsRdf.filter(uc =>
    uc.stakeholders.some(s => stakeholderIds.includes(s))
  );
}

// ─── Standard objects (CEDS elements) ───────────────────────────────────────

export function getObjectsForStandard(standardId: string): StandardObject[] {
  const alignment = cedsAlignmentMatrix.find(a => a.entryId === standardId);
  if (!alignment) return [];

  const objects: StandardObject[] = [];
  const seen = new Set<string>();

  for (const [domainId, data] of Object.entries(alignment.domains)) {
    const d = data as { status: string; cedsElements: string[]; notes: string; gapNotes: string | null };
    if (d.status === 'gap') continue;

    for (const element of d.cedsElements || []) {
      if (!seen.has(element)) {
        seen.add(element);
        objects.push({
          element,
          domain: domainId,
          domainLabel: getDomainLabel(domainId),
          status: d.status as AlignmentStatus,
          notes: d.notes,
          gapNotes: d.gapNotes,
        });
      }
    }
  }

  return objects.sort((a, b) => a.element.localeCompare(b.element));
}

export function getObjectDetail(standardId: string, objectId: string) {
  const alignment = cedsAlignmentMatrix.find(a => a.entryId === standardId);
  if (!alignment) return null;

  // Find which domain(s) this element appears in
  const appearances: Array<{
    domain: string;
    domainLabel: string;
    status: string;
    notes: string;
    gapNotes: string | null;
  }> = [];

  for (const [domainId, data] of Object.entries(alignment.domains)) {
    const d = data as { status: string; cedsElements: string[]; notes: string; gapNotes: string | null };
    if (d.cedsElements?.includes(objectId)) {
      appearances.push({
        domain: domainId,
        domainLabel: getDomainLabel(domainId),
        status: d.status,
        notes: d.notes,
        gapNotes: d.gapNotes,
      });
    }
  }

  if (appearances.length === 0) return null;

  // Find RDF element details from useCasesCedsRdf
  let rdfDetail: { element: string; uri: string; description: string } | null = null;
  for (const uc of useCasesCedsRdf) {
    const el = uc.cedsRdfElements?.find(e => e.element === objectId);
    if (el) {
      rdfDetail = el;
      break;
    }
  }

  // Find field mappings that reference this element
  const relatedMappings = fieldMappings.filter(fm => {
    const conceptLower = fm.concept.toLowerCase();
    const objectLower = objectId.toLowerCase()
      .replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    return conceptLower.includes(objectLower) || objectLower.includes(conceptLower);
  });

  // Find other standards that also reference this element
  const specStore = useKnowledgeStore();
  const otherStandards: Array<{ standardId: string; standardName: string; domain: string; status: string }> = [];
  for (const a of cedsAlignmentMatrix) {
    if (a.entryId === standardId) continue;
    for (const [domainId, data] of Object.entries(a.domains)) {
      const d = data as { status: string; cedsElements: string[] };
      if (d.cedsElements?.includes(objectId)) {
        const entry = specStore.specById(a.entryId);
        otherStandards.push({
          standardId: a.entryId,
          standardName: entry?.title || a.entryShortName,
          domain: domainId,
          status: d.status,
        });
      }
    }
  }

  return {
    element: objectId,
    rdfDetail,
    appearances,
    relatedMappings,
    otherStandards,
  };
}

// ─── CEDS domain utilities ──────────────────────────────────────────────────

export function getAllDomains() {
  return cedsDomains;
}

export function getAlignmentForDomain(domainId: string) {
  const specStore = useKnowledgeStore();
  return cedsAlignmentMatrix.map(a => {
    const domainData = (a.domains as Record<string, { status: string; cedsElements: string[]; notes: string; gapNotes: string | null }>)[domainId];
    if (!domainData) return null;
    const entry = specStore.specById(a.entryId);
    return {
      entryId: a.entryId,
      entryName: entry?.title || a.entryShortName,
      ...(domainData as { status: string; cedsElements: string[]; notes: string; gapNotes: string | null }),
    };
  }).filter(Boolean);
}
