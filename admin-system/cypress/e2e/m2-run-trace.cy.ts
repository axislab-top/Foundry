const AUTH_KEY = 'admin_auth_state';
const fakeAuth = {
  user: { id: '11111111-1111-1111-1111-111111111111', roles: ['admin'] },
  accessToken: 'cypress-test-token',
  refreshToken: 'cypress-refresh',
  expiresIn: 3600,
};

const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const runId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const companyBody = {
  success: true,
  data: {
    id: companyId,
    name: 'M2 Co',
    slug: 'm2-co',
    industry: 'software',
    scale: 'small',
    status: 'active',
    isActive: true,
    logoUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    goal: null,
    initialBudget: null,
    description: null,
    contactEmail: null,
    contactPhone: null,
    timezone: 'UTC',
    defaultLanguage: null,
    createdBy: null,
  },
};

describe('M2 run trace waterfall', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem(AUTH_KEY, JSON.stringify(fakeAuth));
    });
  });

  it('loads Postgres run steps when opening board with runId', () => {
    cy.intercept('GET', `**/api/v1/companies/${companyId}`, {
      statusCode: 200,
      body: companyBody,
    }).as('companyGet');

    cy.intercept('GET', '**/api/v1/dashboard?*', {
      statusCode: 200,
      body: { success: true, data: { generatedAt: new Date().toISOString() } },
    });

    cy.intercept('GET', '**/api/v1/dashboard/billing?*', {
      statusCode: 200,
      body: { success: true, data: { budget: { utilization: 0 } } },
    });

    cy.intercept('GET', '**/api/v1/dashboard/board-runs*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          companyId,
          runningCount: 0,
          failedLast24h: 0,
          recentRuns: [],
          generatedAt: new Date().toISOString(),
        },
      },
    });

    cy.intercept('GET', '**/api/v1/task-runs*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          items: [
            {
              id: runId,
              status: 'failed',
              triggerSource: 'nest_timer',
              startedAt: new Date().toISOString(),
              errorSummary: 'simulated',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 40,
          totalPages: 1,
        },
      },
    }).as('taskRuns');

    cy.intercept('GET', `**/api/v1/task-runs/${runId}/execution-logs*`, {
      statusCode: 200,
      body: {
        success: true,
        data: {
          runId,
          items: [
            {
              id: 'log-1',
              taskId: null,
              agentId: null,
              stepType: 'ceo.graph.error',
              message: 'timeout',
              runId,
              createdAt: new Date().toISOString(),
              durationMs: 1200,
              outputSnapshot: { error: 'timeout' },
              traceId: runId,
              billingUnits: null,
            },
          ],
        },
      },
    }).as('runLogs');

    cy.intercept('GET', `**/api/v1/task-runs/${runId}/trace-events*`, {
      statusCode: 200,
      body: { success: true, data: { items: [] } },
    }).as('traceCh');

    cy.intercept('GET', '**/api/v1/tasks?*', {
      statusCode: 200,
      body: {
        success: true,
        data: { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 },
      },
    });

    cy.visit(`/companies/${companyId}?tab=board&runId=${runId}`);
    cy.wait('@companyGet');
    cy.wait('@taskRuns');
    cy.contains('Run 瀑布流', { timeout: 15000 }).should('exist');
    cy.wait('@runLogs');
    cy.contains('ceo.graph.error').should('exist');
  });
});
