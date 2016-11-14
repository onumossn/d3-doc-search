import { Component, HostListener } from '@angular/core';
import { Headers, URLSearchParams, Http } from '@angular/http';
import { Observable } from "rxjs";
import * as _ from "lodash";

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent {
	docModel: any[] = [];
	filteredDocModel: any[] = [];
	filterText: string = '';
	errorMessage: string = '';
	menuMode: string = 'side';
	menuOpened: boolean = true;
	loading: boolean = true;

	@HostListener('window:resize', ['$event'])
	onResize(event: any) {
		this.menuMode = event.target.innerWidth <= 544 ? 'over' : 'side';
	}

	onMenuClick(menu: any) {
		if (this.menuMode === 'over') {
			menu.close();
		}
	}

	onFilterTextChange(filterText: string) {
		this.filteredDocModel = _(this.docModel)
			.map((model: any) => {
				let filteredChildern: any[];
				let transformed: any = {};

				if (model.name.indexOf(filterText) !== -1) {
					return model;
				}

				filteredChildern = _.filter(model.children, (child: any) => {
					return child.name.indexOf(filterText) !== -1;
				});

				if (filteredChildern.length === 0) {
					return null;
				}

				transformed = _.clone(model);
				transformed.children = filteredChildern;
				return transformed;
			})
			.compact()
			.value();
	}

	githubRequestErrorHandler(err: any) {
		if (_.parseInt(err.headers.get('X-RateLimit-Remaining')) === 0) {
			this.errorMessage = `Github API rate limit exceeded. The documentation may be incomplete.
        Try again after ${new Date(1000 * _.parseInt(err.headers.get('X-RateLimit-Reset'))).toLocaleString()}
        or try another browser (data may be available in localStroage).`;
		}
	}

	constructor(public http: Http) {
		let requestOptions:any = {
			headers: new Headers({ Accept: 'application/vnd.github.VERSION.html' }),
			search: new URLSearchParams()
		};
		let resetTime = _.parseInt(window.localStorage.getItem('github.rate.reset'));

		requestOptions.search.set('client_id', '3b79965190bb8e4aa558');
		requestOptions.search.set('client_secret', '3d415c9c0125bfca905264998aaa347826b7f96e');

		this.filteredDocModel = this.docModel = JSON.parse(window.localStorage.getItem('github.d3.doc.model'));

		if (window.innerWidth <= 544) {
			this.menuMode = 'over';
			this.menuOpened = false;
		}

		if (this.docModel && (Date.now() - resetTime) <= (8 * 60 * 60 * 1000)) {
			this.loading = false; 
		} else {
			http.get('https://api.github.com/repos/d3/d3/contents/API.md?ref=master', requestOptions)
				.subscribe(indexResp => {
					let anchors: NodeListOf<Element>;
					let levelList: any[][] = [[], [], [], [], [], [], []];
					let wrapper: Element = document.createElement('div');
					let headerTags: string[] = [2, 3, 4, 5, 6].map(n => `H${n}`);
					let readmeObservables = [];
					let docModel = [];
					wrapper.innerHTML = indexResp.text();
					anchors = wrapper.querySelectorAll('.markdown-body a.anchor');

					window.localStorage.setItem('github.rate.reset', (1000 * _.parseInt(indexResp.headers.get('X-RateLimit-Reset'))).toString());

					for (let i = 0, ii = anchors.length; i < ii; i++) {
						let anchor: Element = anchors.item(i);
						let item: any;
						while (anchor && headerTags.indexOf(anchor.tagName) === -1) {
							anchor = anchor.parentElement;
						}
						if (anchor) {
							item = {
								name: anchor.textContent.split('(')[0].trim(),
								link: anchor.querySelector('a:not(.anchor)').getAttribute('href'),
								children: []
							};

							if (anchor.tagName === 'H2') {
								item.level = 2;
								docModel.push(item);
								levelList[2].push(item)
							} else {
								let level: number = parseFloat(anchor.tagName[1]);
								let leveli: number = level - 1;
								let parent: any;

								while (!parent && leveli > 1) {
									let levelRow = levelList[leveli];
									parent = levelRow[levelRow.length - 1];
									leveli--;
								}

								if (parent) {
									item.level = level;
									levelList[level].push(item);
									parent.children.push(item);
								}
							}
						}
					}

					docModel.forEach((indexItem: any, j: number) => {
						let section: string = indexItem.link.split('/');
						let request = http.get(`https://api.github.com/repos/d3/${section[section.length - 1].split('#')[0]}/contents/README.md?ref=master`, requestOptions);

						readmeObservables.push(request);

						request
							.subscribe(resp => {
								let content: Element = document.createElement('div');
								let items: Element[] = [];
								let elemList: NodeListOf<Element>;
								content.innerHTML = resp.text();

								elemList = content.querySelectorAll('.markdown-body [name*="user-content"]');

								window.localStorage.setItem('github.rate.reset', (1000 * _.parseInt(resp.headers.get('X-RateLimit-Reset'))).toString());

								for (let i: number = 0, ii: number = elemList.length; i < ii; i++) {
									items.push(elemList.item(i));
								}

								indexItem.children = _(items).map((item: any, i: number) => {
									let nextIndex: number = i;
									let links: string[];

									if (item.tagName === 'H3') {
										return;
									}

									while (item.tagName !== 'P') {
										item = item.parentElement;
									}

									Observable.from(item.querySelectorAll('[name*="user-content"]'))
										.map((link: HTMLAnchorElement) => {
											return link.getAttribute('href').substr(1);
										})
										.distinct()
										.toArray()
										.subscribe((names: string[]) => links = names);

									while (item.contains(items[++nextIndex]));

									let docGroup: Element = document.createElement('div');
									let nextItem: Element = item.nextElementSibling;

									while (nextItem && !nextItem.contains(items[nextIndex])) {
										docGroup.appendChild(nextItem.cloneNode(true));
										nextItem = nextItem.nextElementSibling;
									}
									return {
										name: item.textContent
											.replace(/<>/g, '')
											.replace('#', '')
											.replace(/#/g, '/')
											.trim(),
										elemList: docGroup.innerHTML,
										links: links
									};
								})
									.compact()
									.uniqBy('name')
									.value();
							});
					});

					Observable.forkJoin.apply(this, readmeObservables)
						.subscribe(() => {
							this.docModel = docModel;
							window.localStorage.setItem('github.d3.doc.model', JSON.stringify(this.docModel));
						},
						this.githubRequestErrorHandler.bind(this),
						() => {
							this.loading = false;
							this.onFilterTextChange(this.filterText);
						});
				},
				(err) => {
					this.githubRequestErrorHandler(err);
					this.loading = false;
				});
		}
	}
}
