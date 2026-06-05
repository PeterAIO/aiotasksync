const ASANA_TOKEN = () => process.env.ASANA_TOKEN || '';

async function asanaGet(endpoint: string) {
  const res = await fetch(`https://app.asana.com/api/1.0${endpoint}`, {
    headers: { Authorization: `Bearer ${ASANA_TOKEN()}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getWorkspaces() {
  const data = await asanaGet('/workspaces');
  return data.data as { gid: string; name: string }[];
}

export async function getProjects(workspaceId?: string) {
  if (!workspaceId) {
    const workspaces = await getWorkspaces();
    if (workspaces.length === 0) throw new Error('No Asana workspaces found');
    workspaceId = workspaces[0].gid;
  }

  const all: any[] = [];
  let offset: string | undefined;
  do {
    let endpoint = `/workspaces/${workspaceId}/projects?opt_fields=name,archived&limit=100`;
    if (offset) endpoint += `&offset=${offset}`;
    const data = await asanaGet(endpoint);
    const active = (data.data || []).filter((p: any) => !p.archived);
    all.push(...active);
    offset = data.next_page?.offset;
  } while (offset);

  all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return all;
}

// Get sections for a project (gives us section grouping)
export async function getProjectSections(projectId: string) {
  const data = await asanaGet(`/projects/${projectId}/sections?opt_fields=name`);
  return data.data as { gid: string; name: string }[];
}

// Get tasks in a specific section
export async function getSectionTasks(sectionId: string) {
  const fields = [
    'gid', 'name', 'completed', 'completed_at', 'assignee.name',
    'due_on', 'due_at', 'notes', 'tags.name', 'num_subtasks',
    'created_at', 'modified_at',
  ].join(',');

  const all: any[] = [];
  let offset: string | undefined;
  do {
    let endpoint = `/sections/${sectionId}/tasks?opt_fields=${fields}&limit=100`;
    if (offset) endpoint += `&offset=${offset}`;
    const data = await asanaGet(endpoint);
    all.push(...(data.data || []));
    offset = data.next_page?.offset;
  } while (offset);
  return all;
}

// Get all tasks with their section context
export async function getProjectTasksBySections(projectId: string) {
  const sections = await getProjectSections(projectId);
  const result: { section: string; tasks: any[] }[] = [];

  for (const section of sections) {
    const tasks = await getSectionTasks(section.gid);
    if (tasks.length > 0) {
      result.push({ section: section.name, tasks });
    }
  }
  return result;
}

export async function getSubtasks(taskId: string) {
  const data = await asanaGet(
    `/tasks/${taskId}/subtasks?opt_fields=gid,name,completed,completed_at,assignee.name,due_on,num_subtasks`
  );
  return data.data as any[];
}

// Recursively get subtasks (subtasks of subtasks)
export async function getSubtasksDeep(taskId: string, depth = 0): Promise<any[]> {
  if (depth > 2) return []; // Max 3 levels deep
  const subtasks = await getSubtasks(taskId);
  for (const st of subtasks) {
    if (st.num_subtasks > 0) {
      st.subtasks = await getSubtasksDeep(st.gid, depth + 1);
    }
  }
  return subtasks;
}

export async function getProjectInfo(projectId: string) {
  const data = await asanaGet(`/projects/${projectId}?opt_fields=name,modified_at`);
  return data.data as { gid: string; name: string; modified_at: string };
}
