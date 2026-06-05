'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Company { id: string; properties: { name: string; domain?: string } }
interface Deal { id: string; properties: { dealname: string; amount?: string; dealstage?: string } }
interface AsanaProject { gid: string; name: string }
interface Mapping { projectId: string; projectName: string; companyName?: string; dealName?: string }
interface Mappings { companies: Record<string, Mapping>; deals: Record<string, Mapping> }
interface SyncResult { type: string; id: string; name: string; status: string; error?: string; reason?: string }

// Build a project-centric view from the flat mappings
interface ConnectedProject {
  projectId: string;
  projectName: string;
  company?: { id: string; name: string };
  deal?: { id: string; name: string };
}

function buildConnectedList(mappings: Mappings): ConnectedProject[] {
  const byProject: Record<string, ConnectedProject> = {};

  for (const [companyId, m] of Object.entries(mappings.companies || {})) {
    if (!m.projectId) continue;
    if (!byProject[m.projectId]) {
      byProject[m.projectId] = { projectId: m.projectId, projectName: m.projectName };
    }
    byProject[m.projectId].company = { id: companyId, name: m.companyName || 'Unknown' };
  }

  for (const [dealId, m] of Object.entries(mappings.deals || {})) {
    if (!m.projectId) continue;
    if (!byProject[m.projectId]) {
      byProject[m.projectId] = { projectId: m.projectId, projectName: m.projectName };
    }
    byProject[m.projectId].deal = { id: dealId, name: m.dealName || 'Unknown' };
  }

  return Object.values(byProject);
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  const [view, setView] = useState<'connected' | 'add'>('connected');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [projects, setProjects] = useState<AsanaProject[]>([]);
  const [mappings, setMappings] = useState<Mappings>({ companies: {}, deals: {} });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSyncType, setLastSyncType] = useState<string | null>(null);
  const [asanaOk, setAsanaOk] = useState(false);
  const [hubspotOk, setHubspotOk] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; step: string } | null>(null);

  // Add mapping form state
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedDeal, setSelectedDeal] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [dealSearch, setDealSearch] = useState('');
  const companyTimer = useRef<any>(null);
  const dealTimer = useRef<any>(null);

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { router.push('/login'); return; }
    const data = await res.json();
    setUser(data);
    loadData();
  }

  async function loadData() {
    setLoading(true);
    try {
      const [companiesRes, dealsRes, projectsRes, mappingsRes, syncStatusRes] = await Promise.all([
        fetch('/api/hubspot/companies'),
        fetch('/api/hubspot/deals'),
        fetch('/api/asana/projects'),
        fetch('/api/mappings'),
        fetch('/api/sync/status'),
      ]);

      if (companiesRes.ok) {
        const c = await companiesRes.json();
        if (!c.error) { setCompanies(c); setHubspotOk(true); }
      }
      if (dealsRes.ok) {
        const d = await dealsRes.json();
        if (!d.error) setDeals(d);
      }
      if (projectsRes.ok) {
        const p = await projectsRes.json();
        if (!p.error) { setProjects(p); setAsanaOk(true); }
      }
      if (mappingsRes.ok) {
        const m = await mappingsRes.json();
        if (!m.error) setMappings(m);
      }
      if (syncStatusRes.ok) {
        const s = await syncStatusRes.json();
        if (s.lastRun) setLastSyncTime(s.lastRun);
        if (s.lastRunType) setLastSyncType(s.lastRunType);
      }
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }

  // Refresh Asana projects + HubSpot data when opening Add Mapping
  async function refreshForAddMapping() {
    setView('add');
    try {
      const [projectsRes, companiesRes, dealsRes] = await Promise.all([
        fetch('/api/asana/projects'),
        fetch('/api/hubspot/companies'),
        fetch('/api/hubspot/deals'),
      ]);
      if (projectsRes.ok) {
        const p = await projectsRes.json();
        if (!p.error) setProjects(p);
      }
      if (companiesRes.ok) {
        const c = await companiesRes.json();
        if (!c.error) setCompanies(c);
      }
      if (dealsRes.ok) {
        const d = await dealsRes.json();
        if (!d.error) setDeals(d);
      }
    } catch {}
  }

  // Debounced search for HubSpot companies
  function searchCompanies(value: string) {
    setCompanySearch(value);
    if (companyTimer.current) clearTimeout(companyTimer.current);
    companyTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hubspot/companies?q=${encodeURIComponent(value)}`);
        if (res.ok) setCompanies(await res.json());
      } catch {}
    }, 400);
  }

  // Debounced search for HubSpot deals
  function searchDeals(value: string) {
    setDealSearch(value);
    if (dealTimer.current) clearTimeout(dealTimer.current);
    dealTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hubspot/deals?q=${encodeURIComponent(value)}`);
        if (res.ok) setDeals(await res.json());
      } catch {}
    }, 400);
  }

  async function saveMappings(updated: Mappings) {
    setMappings(updated);
    await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  }

  function saveNewMapping() {
    if (!selectedProject) return;
    const project = projects.find(p => p.gid === selectedProject);
    if (!project) return;

    const updated = {
      companies: { ...mappings.companies },
      deals: { ...mappings.deals },
    };

    if (selectedCompany) {
      const company = companies.find(c => c.id === selectedCompany);
      updated.companies[selectedCompany] = {
        projectId: project.gid,
        projectName: project.name,
        companyName: company?.properties.name || '',
      };
    }

    if (selectedDeal) {
      const deal = deals.find(d => d.id === selectedDeal);
      updated.deals[selectedDeal] = {
        projectId: project.gid,
        projectName: project.name,
        dealName: deal?.properties.dealname || '',
      };
    }

    saveMappings(updated);
    setSelectedProject('');
    setSelectedCompany('');
    setSelectedDeal('');
    setProjectFilter('');
    setView('connected');
  }

  function removeMapping(projectId: string) {
    const updated = {
      companies: { ...mappings.companies },
      deals: { ...mappings.deals },
    };

    // Remove all company/deal mappings for this project
    for (const [id, m] of Object.entries(updated.companies)) {
      if (m.projectId === projectId) delete updated.companies[id];
    }
    for (const [id, m] of Object.entries(updated.deals)) {
      if (m.projectId === projectId) delete updated.deals[id];
    }

    saveMappings(updated);
  }

  async function runSync() {
    setSyncing(true);
    setSyncResults(null);
    setSyncProgress(null);
    const results: SyncResult[] = [];

    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Sync failed');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response stream');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/);
          if (!match) continue;
          try {
            const event = JSON.parse(match[1]);
            if (event.type === 'start') {
              setSyncProgress({ current: 0, total: event.total, step: 'Starting sync...' });
            } else if (event.type === 'progress') {
              setSyncProgress({ current: event.current, total: event.total, step: event.step });
            } else if (event.type === 'result') {
              results.push(event.result);
              setSyncResults([...results]);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (e: any) {
            if (e.message && e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }

      setLastSyncTime(new Date().toISOString());
      setLastSyncType('manual');
      setSyncResults(results);
    } catch (err: any) {
      alert('Sync failed: ' + err.message);
    }
    setSyncing(false);
    setSyncProgress(null);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const connected = buildConnectedList(mappings);
  const filteredProjects = projectFilter
    ? projects.filter(p => p.name.toLowerCase().includes(projectFilter.toLowerCase()))
    : projects;

  // Projects already mapped (to avoid duplicates)
  const mappedProjectIds = new Set(connected.map(c => c.projectId));

  if (!user) return null;

  return (
    <>
      <div className="header">
        <div>
          <h1>AIO TaskSync</h1>
          <div className="subtitle">Sync Asana project tasks to HubSpot timelines</div>
        </div>
        <div className="header-actions">
          <span className="header-user">{user.email}</span>
          {user.role === 'admin' && (
            <button className="btn btn-ghost btn-sm" onClick={() => router.push('/admin')}>Users</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
          <button className="btn btn-sync" onClick={runSync} disabled={syncing || connected.length === 0}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="container">
        {/* Status bar */}
        <div className="status-bar">
          <span className={`status-dot ${asanaOk ? 'ok' : 'err'}`} />
          <span className="status-text">{asanaOk ? 'Asana' : 'Asana: Not connected'}</span>
          <span className={`status-dot ${hubspotOk ? 'ok' : 'err'}`} />
          <span className="status-text">{hubspotOk ? 'HubSpot' : 'HubSpot: Not connected'}</span>
          <span style={{ flex: 1 }} />
          {lastSyncTime && (
            <span className="status-text">
              Last sync: {new Date(lastSyncTime).toLocaleString()} ({lastSyncType === 'manual' ? 'Manual' : 'Auto'})
            </span>
          )}
          <span className="status-text" style={{ marginLeft: 12, color: '#bbb', fontSize: 11 }}>v2.5</span>
        </div>

        {/* View toggle */}
        <div className="view-toggle">
          <button
            className={`toggle-btn ${view === 'connected' ? 'active' : ''}`}
            onClick={() => setView('connected')}
          >
            Connected ({connected.length})
          </button>
          <button
            className={`toggle-btn ${view === 'add' ? 'active' : ''}`}
            onClick={refreshForAddMapping}
          >
            + Add Mapping
          </button>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <p style={{ marginTop: 12 }}>Loading data from Asana & HubSpot...</p>
          </div>
        ) : view === 'connected' ? (
          /* ========== CONNECTED VIEW ========== */
          <div className="connected-view">
            {connected.length === 0 ? (
              <div className="empty-state">
                <h3>No mappings yet</h3>
                <p>Connect an Asana project to a HubSpot company or deal to start syncing.</p>
                <button className="btn btn-primary" onClick={refreshForAddMapping}>+ Add First Mapping</button>
              </div>
            ) : (
              <div className="connected-table">
                <div className="connected-row connected-header">
                  <div>Asana Project</div>
                  <div>HubSpot Company</div>
                  <div>HubSpot Deal</div>
                  <div>Last Sync</div>
                  <div></div>
                </div>
                {connected.map(c => {
                  const syncKey = c.company
                    ? `companies:${c.company.id}`
                    : c.deal ? `deals:${c.deal.id}` : '';
                  return (
                    <div key={c.projectId} className="connected-row">
                      <div>
                        <div className="cell-primary">{c.projectName}</div>
                      </div>
                      <div>
                        {c.company ? (
                          <div className="cell-linked">{c.company.name}</div>
                        ) : (
                          <div className="cell-empty">—</div>
                        )}
                      </div>
                      <div>
                        {c.deal ? (
                          <div className="cell-linked">{c.deal.name}</div>
                        ) : (
                          <div className="cell-empty">—</div>
                        )}
                      </div>
                      <div>
                        {lastSyncTime ? (
                          <div className="cell-sync-time">{new Date(lastSyncTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                        ) : (
                          <div className="cell-empty">Not synced</div>
                        )}
                      </div>
                      <div>
                        <button className="btn-remove" onClick={() => removeMapping(c.projectId)} title="Remove mapping">&times;</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Sync Progress */}
            {syncing && syncProgress && (
              <div className="sync-progress">
                <div className="sync-progress-header">
                  <span className="sync-progress-step">{syncProgress.step}</span>
                  <span className="sync-progress-count">{syncProgress.current} of {syncProgress.total}</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%` }}
                  />
                </div>
                {/* Show results as they come in */}
                {syncResults && syncResults.map((r, i) => (
                  <div key={i} className={`result-item ${r.status === 'unchanged' ? 'skipped' : r.status}`}>
                    <span>{r.status === 'success' ? '\u2713' : r.status === 'error' ? '\u2717' : '—'}</span>
                    <strong>{r.type === 'company' ? 'Company' : 'Deal'}:</strong> {r.name}
                    <span style={{ flex: 1 }} />
                    <span>{
                      r.status === 'success' ? 'Note updated' :
                      r.status === 'unchanged' ? 'No changes' :
                      r.status === 'error' ? r.error :
                      r.reason || r.status
                    }</span>
                  </div>
                ))}
              </div>
            )}

            {/* Sync Results (after sync completes) */}
            {!syncing && syncResults && (
              <div className="sync-results">
                <h3>Sync Results</h3>
                {lastSyncTime && (
                  <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>
                    Synced at {new Date(lastSyncTime).toLocaleString()} — <strong>{lastSyncType === 'manual' ? 'Manual' : 'Auto'}</strong>
                  </p>
                )}
                {syncResults.map((r, i) => (
                  <div key={i} className={`result-item ${r.status === 'unchanged' ? 'skipped' : r.status}`}>
                    <span>{r.status === 'success' ? '\u2713' : r.status === 'error' ? '\u2717' : '—'}</span>
                    <strong>{r.type === 'company' ? 'Company' : 'Deal'}:</strong> {r.name}
                    <span style={{ flex: 1 }} />
                    <span>{
                      r.status === 'success' ? 'Note updated' :
                      r.status === 'unchanged' ? 'No changes' :
                      r.status === 'error' ? r.error :
                      r.reason || r.status
                    }</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ========== ADD MAPPING VIEW ========== */
          <div className="add-mapping">
            <div className="add-columns">
              {/* Left: Asana Project */}
              <div className="add-col">
                <label className="col-label">Asana Project</label>
                <input
                  type="text"
                  className="col-search"
                  placeholder="Search projects..."
                  value={projectFilter}
                  onChange={e => setProjectFilter(e.target.value)}
                />
                <div className="col-list">
                  {filteredProjects.map(p => (
                    <div
                      key={p.gid}
                      className={`col-item ${selectedProject === p.gid ? 'selected' : ''} ${mappedProjectIds.has(p.gid) ? 'already-mapped' : ''}`}
                      onClick={() => !mappedProjectIds.has(p.gid) && setSelectedProject(p.gid)}
                    >
                      <span>{p.name}</span>
                      {mappedProjectIds.has(p.gid) && <span className="mapped-badge">mapped</span>}
                    </div>
                  ))}
                  {filteredProjects.length === 0 && (
                    <div className="col-empty">No projects found</div>
                  )}
                </div>
              </div>

              {/* Middle: HubSpot Company */}
              <div className="add-col">
                <label className="col-label">HubSpot Company <span className="optional">(optional)</span></label>
                <input
                  type="text"
                  className="col-search"
                  placeholder="Search companies..."
                  value={companySearch}
                  onChange={e => searchCompanies(e.target.value)}
                />
                <div className="col-list">
                  {companies.map(c => (
                    <div
                      key={c.id}
                      className={`col-item ${selectedCompany === c.id ? 'selected' : ''}`}
                      onClick={() => setSelectedCompany(selectedCompany === c.id ? '' : c.id)}
                    >
                      <div>
                        <span>{c.properties.name || 'Unnamed'}</span>
                        {c.properties.domain && <div className="col-item-sub">{c.properties.domain}</div>}
                      </div>
                    </div>
                  ))}
                  {companies.length === 0 && (
                    <div className="col-empty">No companies found</div>
                  )}
                </div>
              </div>

              {/* Right: HubSpot Deal */}
              <div className="add-col">
                <label className="col-label">HubSpot Deal <span className="optional">(optional)</span></label>
                <input
                  type="text"
                  className="col-search"
                  placeholder="Search deals..."
                  value={dealSearch}
                  onChange={e => searchDeals(e.target.value)}
                />
                <div className="col-list">
                  {deals.map(d => {
                    const amount = d.properties.amount ? `$${parseFloat(d.properties.amount).toLocaleString()}` : '';
                    return (
                      <div
                        key={d.id}
                        className={`col-item ${selectedDeal === d.id ? 'selected' : ''}`}
                        onClick={() => setSelectedDeal(selectedDeal === d.id ? '' : d.id)}
                      >
                        <div>
                          <span>{d.properties.dealname || 'Unnamed'}</span>
                          {amount && <div className="col-item-sub">{amount}</div>}
                        </div>
                      </div>
                    );
                  })}
                  {deals.length === 0 && (
                    <div className="col-empty">No deals found</div>
                  )}
                </div>
              </div>
            </div>

            {/* Save bar */}
            <div className="save-bar">
              <div className="save-summary">
                {selectedProject ? (
                  <>
                    <strong>{projects.find(p => p.gid === selectedProject)?.name}</strong>
                    {selectedCompany && <> &rarr; {companies.find(c => c.id === selectedCompany)?.properties.name}</>}
                    {selectedDeal && <> &rarr; {deals.find(d => d.id === selectedDeal)?.properties.dealname}</>}
                    {!selectedCompany && !selectedDeal && <span style={{ color: '#999' }}> — select a company or deal</span>}
                  </>
                ) : (
                  <span style={{ color: '#999' }}>Select an Asana project to start</span>
                )}
              </div>
              <div className="save-actions">
                <button className="btn btn-outline btn-sm" onClick={() => { setView('connected'); setSelectedProject(''); setSelectedCompany(''); setSelectedDeal(''); }}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!selectedProject || (!selectedCompany && !selectedDeal)}
                  onClick={saveNewMapping}
                >
                  Save Mapping
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
