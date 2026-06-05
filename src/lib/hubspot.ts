const HUBSPOT_TOKEN = () => process.env.HUBSPOT_TOKEN || '';

async function hubspotGet(endpoint: string) {
  const res = await fetch(`https://api.hubapi.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN()}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot ${res.status}: ${text}`);
  }
  return res.json();
}

async function hubspotPost(endpoint: string, body: any) {
  const res = await fetch(`https://api.hubapi.com${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot ${res.status}: ${text}`);
  }
  return res.json();
}

async function hubspotDelete(endpoint: string) {
  const res = await fetch(`https://api.hubapi.com${endpoint}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN()}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`HubSpot DELETE ${res.status}: ${text}`);
  }
}

async function hubspotPatch(endpoint: string, body: any) {
  const res = await fetch(`https://api.hubapi.com${endpoint}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot PATCH ${res.status}: ${text}`);
  }
  return res.json();
}

export async function searchCompanies(query: string) {
  const body: any = {
    limit: 50,
    properties: ['name', 'domain', 'num_associated_deals'],
    sorts: [{ propertyName: 'name', direction: 'ASCENDING' }],
  };
  if (query) {
    body.query = query;
  }
  return hubspotPost('/crm/v3/objects/companies/search', body);
}

export async function searchDeals(query: string) {
  const body: any = {
    limit: 50,
    properties: ['dealname', 'dealstage', 'amount', 'pipeline'],
    sorts: [{ propertyName: 'dealname', direction: 'ASCENDING' }],
  };
  if (query) {
    body.query = query;
  }
  return hubspotPost('/crm/v3/objects/deals/search', body);
}

// Find existing AIO TaskSync notes on an object
export async function findSyncNotes(objectType: 'companies' | 'deals', objectId: string): Promise<string[]> {
  try {
    // Search notes associated with this object that contain our marker
    const assocType = objectType === 'companies' ? 'company' : 'deal';
    const data = await hubspotGet(
      `/crm/v4/objects/${objectType}/${objectId}/associations/notes`
    );
    const noteIds = (data.results || []).map((r: any) => r.toObjectId?.toString() || r.toObjectId);
    if (!noteIds.length) return [];

    // Check each note for our marker
    const syncNoteIds: string[] = [];
    for (const noteId of noteIds) {
      try {
        const note = await hubspotGet(`/crm/v3/objects/notes/${noteId}?properties=hs_note_body`);
        const body = note.properties?.hs_note_body || '';
        if (body.includes('aiotasksync') || body.includes('AIO TaskSync')) {
          syncNoteIds.push(noteId);
        }
      } catch {}
    }
    return syncNoteIds;
  } catch {
    return [];
  }
}

// Delete a note by ID
export async function deleteNote(noteId: string) {
  await hubspotDelete(`/crm/v3/objects/notes/${noteId}`);
}

// Create a note with our hidden marker
export async function createNote(objectType: 'companies' | 'deals', objectId: string, noteBody: string) {
  const assocTypeId = objectType === 'companies' ? 190 : 214;
  return hubspotPost('/crm/v3/objects/notes', {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: noteBody,
    },
    associations: [
      {
        to: { id: parseInt(objectId) },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assocTypeId }],
      },
    ],
  });
}
