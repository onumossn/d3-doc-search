import { D3DocSearchPage } from './app.po';

describe('d3-doc-search App', function() {
  let page: D3DocSearchPage;

  beforeEach(() => {
    page = new D3DocSearchPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});
