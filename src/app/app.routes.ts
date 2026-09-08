import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'components',
    title: 'Components — Approximately Up',
    data: {
      description:
        'Every buildable part in Approximately Up, with the stats read out of the game’s own prefabs and the game’s own label for each one.',
    },
    loadComponent: () =>
      import('./features/components/components-list').then((m) => m.ComponentsList),
  },
  {
    path: 'components/:id',
    // Title and description are both overridden with the component's own name
    // and in-game description once it loads — see component-detail.ts.
    title: 'Component — Approximately Up',
    loadComponent: () =>
      import('./features/components/component-detail').then((m) => m.ComponentDetail),
  },
  {
    path: 'circuits',
    title: 'Circuits — Approximately Up',
    data: { description: 'Signal processors and the circuits you can build out of them.' },
    loadComponent: () => import('./features/circuits/circuits').then((m) => m.Circuits),
  },
  {
    path: 'circuits/:id',
    // Title and description are overridden with the circuit's own once it
    // loads — see circuits.ts.
    title: 'Circuits — Approximately Up',
    loadComponent: () => import('./features/circuits/circuits').then((m) => m.Circuits),
  },
  {
    path: 'planets',
    title: 'Planets — Approximately Up',
    data: {
      description:
        'The planets and stars of Approximately Up, with the game’s own radii, gravity, air and wind, and a rendered globe for each.',
    },
    loadComponent: () => import('./features/planets/planets-list').then((m) => m.PlanetsList),
  },
  {
    path: 'planets/:id',
    // Title and description are both overridden with the body's own name and
    // figures once it loads — see planet-detail.ts.
    title: 'Planet — Approximately Up',
    loadComponent: () => import('./features/planets/planet-detail').then((m) => m.PlanetDetail),
  },
  {
    path: 'stations',
    title: 'Stations — Approximately Up',
    data: {
      description:
        'The orbital stations of Approximately Up, under the body each one orbits. Missions start and end at these.',
    },
    loadComponent: () => import('./features/stations/stations-list').then((m) => m.StationsList),
  },
  {
    path: 'missions',
    title: 'Missions — Approximately Up',
    data: {
      description:
        'Every objective in Approximately Up, with its rewards, the components it asks for, and what it unlocks.',
    },
    loadComponent: () => import('./features/missions/missions-list').then((m) => m.MissionsList),
  },
  {
    path: 'missions/:id',
    // Title and description are both overridden with the objective's own title
    // and briefing once it loads — see mission-detail.ts.
    title: 'Mission — Approximately Up',
    loadComponent: () => import('./features/missions/mission-detail').then((m) => m.MissionDetail),
  },
  {
    path: 'guides',
    title: 'Guides — Approximately Up',
    data: {
      description:
        'Hand-written explanations and walkthroughs for Approximately Up: how parts unlock, and how to read this wiki without spoiling your game.',
    },
    loadComponent: () => import('./features/guides/guides').then((m) => m.Guides),
  },
  {
    path: 'guides/:id',
    // Title and description are both overridden with the guide's own title and
    // summary once it loads — see guides.ts.
    title: 'Guides — Approximately Up',
    loadComponent: () => import('./features/guides/guides').then((m) => m.Guides),
  },
  {
    path: 'imprint',
    title: 'Imprint — Approximately Up',
    data: { description: 'Who runs this wiki, and how to reach them.' },
    loadComponent: () => import('./features/legal/imprint').then((m) => m.Imprint),
  },
  {
    path: 'privacy',
    title: 'Privacy — Approximately Up',
    data: { description: 'What this wiki does with a request, which is very little.' },
    loadComponent: () => import('./features/legal/privacy').then((m) => m.Privacy),
  },
  {
    path: '',
    pathMatch: 'full',
    title: 'Approximately Up — Wiki',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    // Not a redirect to '': a typo or a stale link silently landing on the
    // home page reads as the wiki losing the page rather than as a wrong
    // address.
    path: '**',
    title: 'Not found — Approximately Up',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
