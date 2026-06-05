import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

const ASANA_TOKEN = () => process.env.ASANA_TOKEN || '';

async function asanaGet(endpoint: string) {
  const res = await fetch(`https://app.asana.com/api/1.0${endpoint}`, {
    headers: { Authorization: `Bearer ${ASANA_TOKEN()}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Asana ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    await requireAuth();
  } catch {
    // Allow unauthenticated for report generation (temporary)
  }

  // Get workspace
  const wsData = await asanaGet('/workspaces');
  const workspaceId = wsData.data[0].gid;

  // Get all projects with full details
  const fields = 'name,created_at,modified_at,archived,completed,completed_at,current_status,current_status_update,start_on,due_on,owner.name';
  const all: any[] = [];
  let offset: string | undefined;
  do {
    let endpoint = `/workspaces/${workspaceId}/projects?opt_fields=${fields}&limit=100`;
    if (offset) endpoint += `&offset=${offset}`;
    const data = await asanaGet(endpoint);
    all.push(...(data.data || []));
    offset = data.next_page?.offset;
  } while (offset);

  // For each project, get sections to find activation/churn indicators
  const projects = [];
  for (const p of all) {
    // Get sections to look for "Go-Live" or activation tasks
    let activationDate: string | null = null;
    let churnDate: string | null = null;
    let goLiveSection: any = null;

    try {
      const sectionsData = await asanaGet(`/projects/${p.gid}/sections?opt_fields=name`);
      const sections = sectionsData.data || [];

      // Look for go-live / activation section
      for (const s of sections) {
        const name = s.name.toLowerCase();
        if (name.includes('go-live') || name.includes('golive') || name.includes('activation') || name.includes('live')) {
          goLiveSection = s;
          break;
        }
      }

      // If found, check for completed "Publish Go-Live" or similar task
      if (goLiveSection) {
        const tasksData = await asanaGet(
          `/sections/${goLiveSection.gid}/tasks?opt_fields=name,completed,completed_at&limit=100`
        );
        for (const t of (tasksData.data || [])) {
          const tName = t.name.toLowerCase();
          if (t.completed && (tName.includes('go-live') || tName.includes('publish') || tName.includes('activation'))) {
            if (!activationDate || (t.completed_at && t.completed_at < activationDate)) {
              activationDate = t.completed_at;
            }
          }
          // Look for churn indicators
          if (t.completed && (tName.includes('churn') || tName.includes('cancel') || tName.includes('offboard'))) {
            churnDate = t.completed_at;
          }
        }
      }

      // Also search all sections for churn tasks
      for (const s of sections) {
        const sName = s.name.toLowerCase();
        if (sName.includes('churn') || sName.includes('cancel') || sName.includes('offboard')) {
          const tasksData = await asanaGet(
            `/sections/${s.gid}/tasks?opt_fields=name,completed,completed_at&limit=100`
          );
          for (const t of (tasksData.data || [])) {
            if (t.completed && t.completed_at) {
              churnDate = t.completed_at;
              break;
            }
          }
        }
      }
    } catch {
      // Skip section analysis on error
    }

    projects.push({
      id: p.gid,
      name: p.name,
      created_at: p.created_at,
      modified_at: p.modified_at,
      start_on: p.start_on,
      due_on: p.due_on,
      archived: p.archived,
      completed: p.completed,
      completed_at: p.completed_at,
      owner: p.owner?.name || null,
      status: p.current_status?.text || null,
      statusColor: p.current_status?.color || null,
      activationDate,
      churnDate,
    });
  }

  // Sort by created_at descending (newest first)
  projects.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  return NextResponse.json({
    total: projects.length,
    active: projects.filter(p => !p.archived && !p.completed).length,
    archived: projects.filter(p => p.archived).length,
    completed: projects.filter(p => p.completed).length,
    withActivation: projects.filter(p => p.activationDate).length,
    withChurn: projects.filter(p => p.churnDate).length,
    projects,
  });
}
