describe('Admin smoke', () => {
  it('login page renders', () => {
    cy.visit('/login');
    cy.get('body').should('be.visible');
  });
});
