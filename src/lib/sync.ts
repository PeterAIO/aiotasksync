import { getMappings, getSyncState, saveSyncState, type SyncState, type Mappings } from './store';
import { getProjectTasksBySections, getSubtasksDeep } from './asana';
import { createNote, deleteNote, findSyncNotes } from './hubspot';

// Render subtasks as simple indented bullets
function renderSubtasks(subtasks: any[], indent: number = 0): string {
  let html = '';
  const pad = 12 + (indent * 14);
  for (const s of subtasks) {
    if (s.completed) {
      const date = s.completed_at
        ? ` (${new Date(s.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
        : '';
      html += `<div style="padding-left:${pad}px;color:#999;font-size:12px">&#10003; <s>${s.name}</s>${date}</div>`;
    } else {
      const assignee = s.assignee?.name ? ` — ${s.assignee.name}` : '';
      const due = s.due_on ? ` (due ${s.due_on})` : '';
      html += `<div style="padding-left:${pad}px;font-size:12px">&#9679; ${s.name}${assignee}${due}</div>`;
    }
    if (s.subtasks?.length) {
      html += renderSubtasks(s.subtasks, indent + 1);
    }
  }
  return html;
}

// Format a due date nicely
function formatDue(due: string, today: string): string {
  if (!due) return '';
  const isOverdue = due < today;
  const d = new Date(due + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return isOverdue
    ? `<span style="color:#cc0000;font-weight:bold">${label} (overdue)</span>`
    : label;
}

// Build the full project note — clean, scannable format
async function buildProjectNote(
  projectName: string,
  sectionedTasks: { section: string; tasks: any[] }[]
): Promise<string | null> {
  const allTasks = sectionedTasks.flatMap(s => s.tasks);
  if (!allTasks.length) return null;

  const open = allTasks.filter(t => !t.completed);
  const done = allTasks.filter(t => t.completed);
  const today = new Date().toISOString().split('T')[0];
  const overdue = open.filter(t => t.due_on && t.due_on < today);
  const pct = Math.round((done.length / allTasks.length) * 100);
  const now = new Date().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  let html = '';

  // ===== HEADER — one glance summary =====
  html += `<h2 style="margin-bottom:4px">${projectName}</h2>`;
  html += `<p style="color:#666;margin:0 0 8px"><strong>${pct}%</strong> complete &nbsp;&#8226;&nbsp; ${open.length} open &nbsp;&#8226;&nbsp; ${done.length} done`;
  if (overdue.length) {
    html += ` &nbsp;&#8226;&nbsp; <span style="color:#cc0000"><strong>${overdue.length} overdue</strong></span>`;
  }
  html += `</p>`;

  // ===== OVERDUE CALLOUT =====
  if (overdue.length) {
    html += `<div style="background:#fff5f5;border-left:3px solid #cc0000;padding:8px 12px;margin:8px 0">`;
    html += `<strong style="color:#cc0000">Overdue</strong><br/>`;
    for (const t of overdue) {
      const assignee = t.assignee?.name || 'Unassigned';
      const d = new Date(t.due_on + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      html += `<div style="font-size:13px">&#9679; <strong>${t.name}</strong> — ${assignee} (was due ${d})</div>`;
    }
    html += `</div>`;
  }

  // ===== SECTIONS =====
  for (const { section, tasks } of sectionedTasks) {
    if (tasks.length === 0) continue;
    const sectionDone = tasks.filter(t => t.completed);

    html += `<h3 style="margin:16px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px">${section} <span style="color:#999;font-weight:normal;font-size:13px">(${sectionDone.length}/${tasks.length} done)</span></h3>`;

    // Render tasks in Asana's original order — completed tasks keep their position,
    // just shown with a checkmark and strikethrough.
    for (const t of tasks) {
      if (t.completed) {
        const date = t.completed_at
          ? ` <span style="color:#999">(${new Date(t.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>`
          : '';
        html += `<div style="padding:4px 0;color:#888">`;
        html += `<span style="color:#00856f">&#10003;</span> <s>${t.name}</s>${date}`;
        html += `</div>`;
      } else {
        const assignee = t.assignee?.name || 'Unassigned';
        const due = formatDue(t.due_on, today);

        html += `<div style="padding:4px 0">`;
        html += `&#9744; <strong>${t.name}</strong>`;
        html += `<span style="color:#666"> — ${assignee}</span>`;
        if (due) html += ` &nbsp;&#8226;&nbsp; ${due}`;
        html += `</div>`;
      }

      // Subtasks inline (for both open and completed parents)
      if (t.num_subtasks > 0) {
        try {
          const subtasks = await getSubtasksDeep(t.gid);
          if (subtasks.length > 0) {
            html += renderSubtasks(subtasks);
          }
        } catch {}
      }
    }
  }

  // ===== FOOTER =====
  html += `<p style="color:#bbb;font-size:11px;margin-top:16px;border-top:1px solid #eee;padding-top:8px">Synced ${now} by AIO TaskSync</p>`;
  return html;
}

// Sync a single mapping
async function syncOne(
  objectType: 'companies' | 'deals',
  objectId: string,
  mapping: { projectId: string; projectName: string; companyName?: string; dealName?: string },
  syncState: SyncState,
  force: boolean = false
): Promise<{ status: string; reason?: string; error?: string }> {
  const key = `${objectType}:${objectId}`;

  try {
    // Always regenerate — Asana project-level modified_at does not reflect subtask changes,
    // so change detection at the project level causes stale notes. Since we have ~20
    // mappings, the cost of always regenerating is acceptable.

    // Fetch tasks grouped by section
    const sectionedTasks = await getProjectTasksBySections(mapping.projectId);
    const note = await buildProjectNote(mapping.projectName, sectionedTasks);

    if (!note) {
      return { status: 'skipped', reason: 'No tasks in project' };
    }

    // Delete old sync notes
    const oldNoteIds = await findSyncNotes(objectType, objectId);
    for (const noteId of oldNoteIds) {
      await deleteNote(noteId);
    }

    // Create new note
    await createNote(objectType, objectId, note);

    // Update sync state (timestamp-based)
    syncState.lastSync[key] = new Date().toISOString();

    return { status: 'success' };
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

export interface SyncResult {
  type: string;
  id: string;
  name: string;
  status: string;
  reason?: string;
  error?: string;
}

// How many mappings to sync at once. Rate-limit 429s are handled by retry/backoff
// in the Asana/HubSpot layers, so this self-throttles under load.
const SYNC_CONCURRENCY = 5;

interface SyncItem {
  objectType: 'companies' | 'deals';
  id: string;
  mapping: { projectId: string; projectName: string; companyName?: string; dealName?: string };
  type: 'company' | 'deal';
  name: string;
}

function collectItems(mappings: Mappings): SyncItem[] {
  const items: SyncItem[] = [];
  for (const [id, mapping] of Object.entries(mappings.companies || {})) {
    if (mapping.projectId) items.push({ objectType: 'companies', id, mapping, type: 'company', name: mapping.companyName || '' });
  }
  for (const [id, mapping] of Object.entries(mappings.deals || {})) {
    if (mapping.projectId) items.push({ objectType: 'deals', id, mapping, type: 'deal', name: mapping.dealName || '' });
  }
  return items;
}

// Run `fn` over items with a bounded number in flight at once. Results keep input order.
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function runFullSync(force: boolean = false, runType: 'manual' | 'auto' = 'auto'): Promise<SyncResult[]> {
  const mappings = await getMappings();
  const syncState = await getSyncState();
  const items = collectItems(mappings);

  const results = await mapPool(items, SYNC_CONCURRENCY, async (item): Promise<SyncResult> => {
    const result = await syncOne(item.objectType, item.id, item.mapping, syncState, force);
    return { type: item.type, id: item.id, name: item.name, ...result };
  });

  await saveSyncState(syncState, runType);
  return results;
}

export interface StreamEvent {
  type: 'start' | 'progress' | 'result' | 'done' | 'error';
  total?: number;
  current?: number;
  name?: string;
  step?: string;
  result?: SyncResult;
  error?: string;
}

export async function runStreamingSync(
  force: boolean,
  runType: 'manual' | 'auto',
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const mappings = await getMappings();
  const syncState = await getSyncState();
  const items = collectItems(mappings);

  onEvent({ type: 'start', total: items.length });

  // Items run concurrently; emit progress/result as each one finishes.
  let completed = 0;
  await mapPool(items, SYNC_CONCURRENCY, async (item) => {
    const result = await syncOne(item.objectType, item.id, item.mapping, syncState, force);
    const syncResult: SyncResult = { type: item.type, id: item.id, name: item.name, ...result };

    completed++;
    onEvent({ type: 'progress', current: completed, total: items.length, name: item.name, step: `Synced ${item.name}` });
    onEvent({ type: 'result', current: completed, total: items.length, result: syncResult });
  });

  await saveSyncState(syncState, runType);
}
