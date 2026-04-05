const AUTH_KEY = 'admin_auth_state';
const fakeAuth = {
  user: { id: '11111111-1111-1111-1111-111111111111', roles: ['admin'] },
  accessToken: 'cypress-test-token',
  refreshToken: 'cypress-refresh',
  expiresIn: 3600,
};

const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const rootTaskId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const childTaskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const companyBody = {
  success: true,
  data: {
    id: companyId,
    name: 'Cypress Co',
    slug: 'cypress-co',
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

describe('Board room (董事会)', () => {
  beforeEach(() => {
    cy.window().then((win) => {
      win.localStorage.setItem(AUTH_KEY, JSON.stringify(fakeAuth));
    });
  });

  it('loads board tab, graph, and grouped logs after node click', () => {
    cy.intercept('GET', `**/api/v1/companies/${companyId}`, {
      statusCode: 200,
      body: companyBody,
    }).as('companyGet');

    cy.intercept('GET', '**/api/v1/dashboard?*', {
      statusCode: 200,
      body: {
        success: true,
        data: { generatedAt: new Date().toISOString() },
      },
    }).as('dashSummary');

    cy.intercept('GET', '**/api/v1/dashboard/billing?*', {
      statusCode: 200,
      body: {
        success: true,
        data: { budget: { utilization: 0 } },
      },
    }).as('dashBilling');

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
    }).as('boardRuns');

    cy.intercept('GET', '**/api/v1/task-runs*', {
      statusCode: 200,
      body: {
        success: true,
        data: { items: [], total: 0, page: 1, pageSize: 40, totalPages: 1 },
      },
    }).as('taskRuns');

    cy.intercept('GET', '**/api/v1/tasks?*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          items: [{ id: rootTaskId, title: 'Root', status: 'pending', parentId: null }],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        },
      },
    }).as('tasksList');

    cy.intercept('GET', `**/api/v1/tasks/${rootTaskId}/tree*`, {
      statusCode: 200,
      body: {
        success: true,
        data: {
          rootId: rootTaskId,
          nodes: [
            {
              id: rootTaskId,
              title: 'Root',
              status: 'pending',
              parentId: null,
            },
            {
              id: childTaskId,
              title: 'Child',
              status: 'in_progress',
              parentId: rootTaskId,
            },
          ],
        },
      },
    }).as('taskTree');

    cy.intercept('GET', '**/api/v1/tasks/dependencies*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          edges: [{ taskId: childTaskId, dependsOnTaskId: rootTaskId }],
        },
      },
    }).as('taskDeps');

    cy.intercept('GET', '**/api/v1/tasks/*/execution-logs/grouped*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          taskId: childTaskId,
          groups: [
            {
              runId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
              latestAt: new Date().toISOString(),
              items: [
                {
                  id: 'log-1',
                  agentId: null,
                  stepType: 'heartbeat',
                  message: 'ok',
                  runId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          ],
        },
      },
    }).as('logsGrouped');

    cy.visit(`/companies/${companyId}?tab=board`);

    cy.wait('@companyGet');
    cy.contains('董事会视图', { timeout: 15000 }).should('be.visible');
    cy.wait('@boardRuns').its('response.statusCode').should('eq', 200);
    cy.wait('@taskRuns').its('response.statusCode').should('eq', 200);
    cy.wait('@tasksList').its('response.statusCode').should('eq', 200);
    cy.wait('@taskTree').its('response.statusCode').should('eq', 200);
    cy.wait('@taskDeps').its('response.statusCode').should('eq', 200);

    cy.contains('任务树与依赖').should('be.visible');
    cy.contains('运行记录').should('be.visible');

    cy.get('.react-flow', { timeout: 15000 }).should('exist');
    cy.get('.react-flow__node').should('have.length.at.least', 1);

    cy.get('.react-flow__node').eq(1).click({ force: true });
    cy.wait('@logsGrouped').its('response.statusCode').should('eq', 200);
    cy.contains('执行轨迹').should('be.visible');
    cy.contains('li', 'heartbeat', { matchCase: false }).should('exist');
  });
});
