/**
 * Incident & On-call tools — incident management and escalation
 * DevOps Agent uses these to correlate investigations with existing incidents,
 * check who's on call, and manage incident lifecycle.
 */

import { getIncidents, getOnCallSchedule, getIncidentHistory } from '../data/fixtures.mjs';

// In-memory state for demo (acknowledged incidents)
const acknowledgedIncidents = new Set();

export const incidentTools = [
  {
    name: 'get_open_incidents',
    description: 'List all currently open incidents across summit-store services. Returns severity, affected services, timeline, and current assignee.',
    inputSchema: {
      type: 'object',
      properties: {
        severity: {
          type: 'string',
          description: 'Filter by severity level',
          enum: ['critical', 'high', 'medium', 'low'],
        },
        service_name: {
          type: 'string',
          description: 'Filter by affected service',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
      },
    },
  },
  {
    name: 'get_incident_details',
    description: 'Get full details of a specific incident including timeline, related alerts, impacted customers, and mitigation actions taken.',
    inputSchema: {
      type: 'object',
      properties: {
        incident_id: {
          type: 'string',
          description: 'Incident identifier (e.g., INC-2026-0042)',
        },
      },
      required: ['incident_id'],
    },
  },
  {
    name: 'get_on_call_schedule',
    description: 'Get the current on-call rotation for summit-store services. Returns primary and secondary responders, escalation chain, and contact methods.',
    inputSchema: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Team name',
          enum: ['platform', 'payments', 'data', 'sre'],
        },
      },
    },
  },
  {
    name: 'acknowledge_incident',
    description: 'Acknowledge an incident, indicating a responder is actively working on it. Updates incident status and notifies stakeholders.',
    inputSchema: {
      type: 'object',
      properties: {
        incident_id: {
          type: 'string',
          description: 'Incident identifier to acknowledge',
        },
        responder: {
          type: 'string',
          description: 'Name or alias of the responder acknowledging',
        },
        initial_assessment: {
          type: 'string',
          description: 'Brief initial assessment or hypothesis',
        },
      },
      required: ['incident_id', 'responder'],
    },
  },
  {
    name: 'get_incident_history',
    description: 'Get historical incidents for a service within a time range. Useful for identifying recurring patterns and comparing with current issues.',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: {
          type: 'string',
          description: 'Service to query history for',
          enum: ['order-service', 'payment-service', 'inventory-service'],
        },
        days_back: {
          type: 'number',
          description: 'Number of days of history to retrieve (max 90)',
          default: 30,
        },
        include_resolved: {
          type: 'boolean',
          description: 'Include resolved incidents in results',
          default: true,
        },
      },
      required: ['service_name'],
    },
  },
  {
    name: 'escalate_incident',
    description: 'Escalate an incident to the next level in the escalation chain. Notifies the next responder and updates incident severity if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        incident_id: {
          type: 'string',
          description: 'Incident identifier to escalate',
        },
        reason: {
          type: 'string',
          description: 'Reason for escalation',
        },
        new_severity: {
          type: 'string',
          description: 'Optionally upgrade severity',
          enum: ['critical', 'high', 'medium', 'low'],
        },
      },
      required: ['incident_id', 'reason'],
    },
  },
];

export function handleIncidentTool(name, args) {
  switch (name) {
    case 'get_open_incidents':
      return handleGetOpenIncidents(args);

    case 'get_incident_details':
      return handleGetIncidentDetails(args.incident_id);

    case 'get_on_call_schedule':
      return getOnCallSchedule(args.team);

    case 'acknowledge_incident':
      return handleAcknowledge(args);

    case 'get_incident_history':
      return getIncidentHistory(args.service_name, args.days_back || 30, args.include_resolved !== false);

    case 'escalate_incident':
      return handleEscalate(args);

    default:
      return { error: `Unknown incident tool: ${name}` };
  }
}

function handleGetOpenIncidents({ severity, service_name }) {
  let incidents = getIncidents();

  if (severity) {
    incidents = incidents.filter(i => i.severity === severity);
  }
  if (service_name) {
    incidents = incidents.filter(i => i.affectedServices.includes(service_name));
  }

  return {
    totalOpen: incidents.length,
    incidents: incidents.map(i => ({
      ...i,
      acknowledged: acknowledgedIncidents.has(i.incidentId),
    })),
    summary: `${incidents.length} open incident(s)` +
      (severity ? ` with severity=${severity}` : '') +
      (service_name ? ` affecting ${service_name}` : ''),
  };
}

function handleGetIncidentDetails(incidentId) {
  const incidents = getIncidents();
  const incident = incidents.find(i => i.incidentId === incidentId);

  if (!incident) {
    return { error: `Incident ${incidentId} not found`, availableIncidents: incidents.map(i => i.incidentId) };
  }

  return {
    ...incident,
    acknowledged: acknowledgedIncidents.has(incidentId),
    timeline: incident.timeline || [],
    relatedAlarms: incident.relatedAlarms || [],
    impactAssessment: incident.impactAssessment || 'Not yet assessed',
    mitigationActions: incident.mitigationActions || [],
  };
}

function handleAcknowledge({ incident_id, responder, initial_assessment }) {
  acknowledgedIncidents.add(incident_id);
  return {
    incidentId: incident_id,
    status: 'ACKNOWLEDGED',
    acknowledgedBy: responder,
    acknowledgedAt: new Date().toISOString(),
    initialAssessment: initial_assessment || 'Investigating',
    message: `Incident ${incident_id} acknowledged by ${responder}. Stakeholders have been notified.`,
    nextSteps: [
      'Review related CloudWatch alarms and metrics',
      'Check recent deployments for correlation',
      'Update incident timeline with findings',
      'Escalate if not mitigated within 15 minutes',
    ],
  };
}

function handleEscalate({ incident_id, reason, new_severity }) {
  // Determine team from incident's affected services
  const incidents = getIncidents();
  const incident = incidents.find(i => i.incidentId === incident_id);
  let team = 'sre'; // default fallback
  if (incident) {
    const service = incident.affectedServices?.[0];
    if (service === 'order-service') team = 'platform';
    else if (service === 'payment-service') team = 'payments';
    else if (service === 'inventory-service') team = 'data';
  }
  const schedule = getOnCallSchedule(team);
  return {
    incidentId: incident_id,
    status: 'ESCALATED',
    escalatedAt: new Date().toISOString(),
    reason,
    newSeverity: new_severity || 'unchanged',
    escalatedTo: {
      name: schedule.escalationChain?.[1]?.name || 'SRE Team Lead',
      contactMethod: 'Slack + Phone',
      expectedResponseTime: '5 minutes',
    },
    notifications: [
      { channel: 'Slack (#summit-store-incidents)', status: 'sent' },
      { channel: 'PagerDuty', status: 'sent' },
      { channel: 'Email (team leads)', status: 'sent' },
    ],
    message: `Incident ${incident_id} escalated. Reason: ${reason}`,
  };
}
